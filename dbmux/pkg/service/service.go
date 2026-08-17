package service

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/gen/dbmux/v1/dbmuxv1connect"
	"dbmux/pkg/cron"
	"dbmux/pkg/providers"
	"dbmux/pkg/pubsub"
	"dbmux/pkg/queue"
	"dbmux/pkg/registry"
	"dbmux/pkg/secrets"
	"dbmux/pkg/state"
)

// Server aggregates domain-specific Connect-Go sub-services.
type Server struct {
	Registry *RegistryService
	Postgres *PostgresService
	MySQL    *MySQLService
	SQLite   *SQLiteService
	KV       *KVService
	Mongo    *MongoService
	Vector   *VectorService
	State    *StateService
	Cron     *CronService
	Secret   *SecretService
	PubSub   *PubSubService
	Queue    *QueueService
}

// NewServer creates a new instance of the DBMux Connect-Go gateway server.
func NewServer(reg *registry.Registry) *Server {
	se := state.NewStateEngine(reg)
	cs := cron.NewDistributedCronScheduler(se)
	secEngine := secrets.NewSecretEngine()
	psEngine := pubsub.NewPubSubEngine(reg)
	qEngine := queue.NewQueueEngine(reg)
	return &Server{
		Registry: &RegistryService{reg: reg},
		Postgres: &PostgresService{reg: reg},
		MySQL:    &MySQLService{reg: reg},
		SQLite:   &SQLiteService{reg: reg},
		KV:       &KVService{reg: reg},
		Mongo:    &MongoService{reg: reg},
		Vector:   &VectorService{reg: reg},
		State:    &StateService{se: se},
		Cron:     &CronService{cs: cs},
		Secret:   &SecretService{secEngine: secEngine},
		PubSub:   &PubSubService{engine: psEngine},
		Queue:    &QueueService{engine: qEngine},
	}
}


// --- 1. Registry Service ---
type RegistryService struct {
	reg *registry.Registry
}

var _ dbmuxv1connect.RegistryHandler = (*RegistryService)(nil)

func (s *RegistryService) RegisterProvider(ctx context.Context, req *connect.Request[dbmuxv1.RegisterProviderRequest]) (*connect.Response[dbmuxv1.RegisterProviderResponse], error) {
	pReq := req.Msg
	p, err := createProviderWithMetadata(ctx, pReq.Category, pReq.ProviderId, pReq.Dsn, pReq.Metadata)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err := s.reg.Register(p); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&dbmuxv1.RegisterProviderResponse{
		Success: true,
		Message: fmt.Sprintf("Provider %s registered successfully", pReq.ProviderId),
	}), nil
}

func (s *RegistryService) ListProviders(ctx context.Context, req *connect.Request[dbmuxv1.ListProvidersRequest]) (*connect.Response[dbmuxv1.ListProvidersResponse], error) {
	providersList := s.reg.List()
	flags := []byte{'0', '0', '0', '0', '0', '0'}

	for _, p := range providersList {
		switch p.Category {
		case dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES:
			flags[0] = '1'
		case dbmuxv1.DBCategory_DB_CATEGORY_MYSQL:
			flags[1] = '1'
		case dbmuxv1.DBCategory_DB_CATEGORY_SQLITE:
			flags[2] = '1'
		case dbmuxv1.DBCategory_DB_CATEGORY_REDIS:
			flags[3] = '1'
		case dbmuxv1.DBCategory_DB_CATEGORY_MONGO:
			flags[4] = '1'
		case dbmuxv1.DBCategory_DB_CATEGORY_VECTOR:
			flags[5] = '1'
		}
	}

	return connect.NewResponse(&dbmuxv1.ListProvidersResponse{
		Providers: providersList,
		DbFlags:   string(flags),
	}), nil
}

// --- 2. Postgres Service (`/dbmux.v1.Postgres/Query`, `/dbmux.v1.Postgres/Exec`) ---
type PostgresService struct {
	reg *registry.Registry
}

var _ dbmuxv1connect.PostgresHandler = (*PostgresService)(nil)

func (s *PostgresService) Query(ctx context.Context, req *connect.Request[dbmuxv1.PostgresQueryRequest]) (*connect.Response[dbmuxv1.PostgresQueryResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	sqlProv, ok := p.(providers.SQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not an SQL provider", req.Msg.ProviderId))
	}
	res, err := sqlProv.Query(ctx, req.Msg.Query, req.Msg.Params)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.PostgresQueryResponse{Columns: res.Columns, Rows: res.Rows, RowsReturned: res.RowsReturned}), nil
}

func (s *PostgresService) Exec(ctx context.Context, req *connect.Request[dbmuxv1.PostgresExecRequest]) (*connect.Response[dbmuxv1.PostgresExecResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	sqlProv, ok := p.(providers.SQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not an SQL provider", req.Msg.ProviderId))
	}
	res, err := sqlProv.Exec(ctx, req.Msg.Query, req.Msg.Params)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.PostgresExecResponse{RowsAffected: res.RowsAffected}), nil
}

// --- 3. MySQL Service (`/dbmux.v1.MySQL/Query`, `/dbmux.v1.MySQL/Exec`) ---
type MySQLService struct {
	reg *registry.Registry
}

var _ dbmuxv1connect.MySQLHandler = (*MySQLService)(nil)

func (s *MySQLService) Query(ctx context.Context, req *connect.Request[dbmuxv1.MySQLQueryRequest]) (*connect.Response[dbmuxv1.MySQLQueryResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	sqlProv, ok := p.(providers.SQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not an SQL provider", req.Msg.ProviderId))
	}
	res, err := sqlProv.Query(ctx, req.Msg.Query, req.Msg.Params)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.MySQLQueryResponse{Columns: res.Columns, Rows: res.Rows, RowsReturned: res.RowsReturned}), nil
}

func (s *MySQLService) Exec(ctx context.Context, req *connect.Request[dbmuxv1.MySQLExecRequest]) (*connect.Response[dbmuxv1.MySQLExecResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	sqlProv, ok := p.(providers.SQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not an SQL provider", req.Msg.ProviderId))
	}
	res, err := sqlProv.Exec(ctx, req.Msg.Query, req.Msg.Params)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.MySQLExecResponse{RowsAffected: res.RowsAffected, LastInsertId: res.LastInsertId}), nil
}

// --- 4. SQLite / LibSQL Service (`/dbmux.v1.SQLite/Query`, `/dbmux.v1.SQLite/Exec`) ---
type SQLiteService struct {
	reg *registry.Registry
}

var _ dbmuxv1connect.SQLiteHandler = (*SQLiteService)(nil)

func (s *SQLiteService) Query(ctx context.Context, req *connect.Request[dbmuxv1.SQLiteQueryRequest]) (*connect.Response[dbmuxv1.SQLiteQueryResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	sqlProv, ok := p.(providers.SQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not an SQL provider", req.Msg.ProviderId))
	}
	res, err := sqlProv.Query(ctx, req.Msg.Query, req.Msg.Params)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.SQLiteQueryResponse{Columns: res.Columns, Rows: res.Rows, RowsReturned: res.RowsReturned}), nil
}

func (s *SQLiteService) Exec(ctx context.Context, req *connect.Request[dbmuxv1.SQLiteExecRequest]) (*connect.Response[dbmuxv1.SQLiteExecResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	sqlProv, ok := p.(providers.SQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not an SQL provider", req.Msg.ProviderId))
	}
	res, err := sqlProv.Exec(ctx, req.Msg.Query, req.Msg.Params)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.SQLiteExecResponse{RowsAffected: res.RowsAffected, LastInsertId: res.LastInsertId}), nil
}

// --- 5. Key-Value Service (`/dbmux.v1.KV/Get`, `/dbmux.v1.KV/Set`, `/dbmux.v1.KV/Del`) ---
type KVService struct {
	reg *registry.Registry
}

var _ dbmuxv1connect.KVHandler = (*KVService)(nil)

func (s *KVService) Get(ctx context.Context, req *connect.Request[dbmuxv1.KVGetRequest]) (*connect.Response[dbmuxv1.KVGetResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	kvProv, ok := p.(providers.KVProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not a KV provider", req.Msg.ProviderId))
	}
	res, err := kvProv.Get(ctx, req.Msg.Key)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(res), nil
}

func (s *KVService) Set(ctx context.Context, req *connect.Request[dbmuxv1.KVSetRequest]) (*connect.Response[dbmuxv1.KVSetResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	kvProv, ok := p.(providers.KVProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not a KV provider", req.Msg.ProviderId))
	}
	res, err := kvProv.Set(ctx, req.Msg.Key, req.Msg.Value, req.Msg.TtlSeconds)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(res), nil
}

func (s *KVService) Del(ctx context.Context, req *connect.Request[dbmuxv1.KVDelRequest]) (*connect.Response[dbmuxv1.KVDelResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	kvProv, ok := p.(providers.KVProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not a KV provider", req.Msg.ProviderId))
	}
	res, err := kvProv.Del(ctx, req.Msg.Key)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(res), nil
}

// --- 6. MongoDB Service (`/dbmux.v1.Mongo/Find`, `/dbmux.v1.Mongo/Insert`) ---
type MongoService struct {
	reg *registry.Registry
}

var _ dbmuxv1connect.MongoHandler = (*MongoService)(nil)

func (s *MongoService) Find(ctx context.Context, req *connect.Request[dbmuxv1.MongoFindRequest]) (*connect.Response[dbmuxv1.MongoFindResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	noSQLProv, ok := p.(providers.NoSQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not a NoSQL provider", req.Msg.ProviderId))
	}
	res, err := noSQLProv.DocFind(ctx, req.Msg.Database, req.Msg.Collection, req.Msg.FilterJson, req.Msg.Limit)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.MongoFindResponse{DocumentsJson: res.DocumentsJson}), nil
}

func (s *MongoService) Insert(ctx context.Context, req *connect.Request[dbmuxv1.MongoInsertRequest]) (*connect.Response[dbmuxv1.MongoInsertResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	noSQLProv, ok := p.(providers.NoSQLProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not a NoSQL provider", req.Msg.ProviderId))
	}
	res, err := noSQLProv.DocInsert(ctx, req.Msg.Database, req.Msg.Collection, req.Msg.DocumentJson)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.MongoInsertResponse{Success: res.Success, InsertedId: res.InsertedId}), nil
}

// --- 7. Vector Service (`/dbmux.v1.Vector/Search`, `/dbmux.v1.Vector/Insert`) ---
type VectorService struct {
	reg *registry.Registry
}

var _ dbmuxv1connect.VectorHandler = (*VectorService)(nil)

func (s *VectorService) Search(ctx context.Context, req *connect.Request[dbmuxv1.VectorSearchRequest]) (*connect.Response[dbmuxv1.VectorSearchResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	vecProv, ok := p.(providers.VectorProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not a Vector provider", req.Msg.ProviderId))
	}
	res, err := vecProv.VectorSearch(ctx, req.Msg.CollectionName, req.Msg.Vector, req.Msg.Limit, req.Msg.FilterPayload)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(res), nil
}

func (s *VectorService) Insert(ctx context.Context, req *connect.Request[dbmuxv1.VectorInsertRequest]) (*connect.Response[dbmuxv1.VectorInsertResponse], error) {
	p, ok := s.reg.Get(req.Msg.ProviderId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("provider %s not found", req.Msg.ProviderId))
	}
	vecProv, ok := p.(providers.VectorProvider)
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("provider %s is not a Vector provider", req.Msg.ProviderId))
	}
	res, err := vecProv.VectorInsert(ctx, req.Msg.CollectionName, req.Msg.PointId, req.Msg.Vector, req.Msg.Payload)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(res), nil
}

// --- 8. State Service (`/dbmux.v1.State/SaveState`, `/dbmux.v1.State/GetState`, `/dbmux.v1.State/DeleteState`) ---
type StateService struct {
	se *state.StateEngine
}

var _ dbmuxv1connect.StateHandler = (*StateService)(nil)

func (s *StateService) SaveState(ctx context.Context, req *connect.Request[dbmuxv1.SaveStateRequest]) (*connect.Response[dbmuxv1.SaveStateResponse], error) {
	err := s.se.SaveState(ctx, req.Msg.Key, req.Msg.ValueJson, req.Msg.TtlSeconds)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.SaveStateResponse{
		Success: true,
		Message: fmt.Sprintf("State for key %s saved successfully", req.Msg.Key),
	}), nil
}

func (s *StateService) GetState(ctx context.Context, req *connect.Request[dbmuxv1.GetStateRequest]) (*connect.Response[dbmuxv1.GetStateResponse], error) {
	val, found, err := s.se.GetState(ctx, req.Msg.Key)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.GetStateResponse{
		Found:     found,
		Key:       req.Msg.Key,
		ValueJson: val,
	}), nil
}

func (s *StateService) DeleteState(ctx context.Context, req *connect.Request[dbmuxv1.DeleteStateRequest]) (*connect.Response[dbmuxv1.DeleteStateResponse], error) {
	err := s.se.DeleteState(ctx, req.Msg.Key)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.DeleteStateResponse{
		Success: true,
	}), nil
}

// --- 9. Cron Service (`/dbmux.v1.Cron/RegisterCron`, `/dbmux.v1.Cron/TriggerCron`) ---
type CronService struct {
	cs *cron.DistributedCronScheduler
}

var _ dbmuxv1connect.CronHandler = (*CronService)(nil)

func (s *CronService) RegisterCron(ctx context.Context, req *connect.Request[dbmuxv1.RegisterCronRequest]) (*connect.Response[dbmuxv1.RegisterCronResponse], error) {
	job, err := s.cs.RegisterCron(req.Msg.CronId, req.Msg.Schedule, req.Msg.PayloadJson)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.RegisterCronResponse{
		Success: true,
		CronId:  job.ID,
	}), nil
}

func (s *CronService) TriggerCron(ctx context.Context, req *connect.Request[dbmuxv1.TriggerCronRequest]) (*connect.Response[dbmuxv1.TriggerCronResponse], error) {
	executed, locked, msg, err := s.cs.TriggerCron(ctx, req.Msg.CronId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.TriggerCronResponse{
		Executed:     executed,
		AcquiredLock: locked,
		Message:      msg,
	}), nil
}

// --- 10. Secret Service (`/dbmux.v1.Secret/GetSecret`) ---
type SecretService struct {
	secEngine *secrets.SecretEngine
}

var _ dbmuxv1connect.SecretHandler = (*SecretService)(nil)

func (s *SecretService) GetSecret(ctx context.Context, req *connect.Request[dbmuxv1.GetSecretRequest]) (*connect.Response[dbmuxv1.GetSecretResponse], error) {
	val, found, err := s.secEngine.GetSecret(ctx, req.Msg.StoreName, req.Msg.SecretKey)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.GetSecretResponse{
		Found:       found,
		SecretKey:   req.Msg.SecretKey,
		SecretValue: val,
	}), nil
}

func (s *SecretService) GetBulkSecrets(ctx context.Context, req *connect.Request[dbmuxv1.GetBulkSecretsRequest]) (*connect.Response[dbmuxv1.GetBulkSecretsResponse], error) {
	secMap, err := s.secEngine.GetBulkSecrets(ctx, req.Msg.StoreName)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.GetBulkSecretsResponse{
		Secrets: secMap,
	}), nil
}

func (s *SecretService) SetSecret(ctx context.Context, req *connect.Request[dbmuxv1.SetSecretRequest]) (*connect.Response[dbmuxv1.SetSecretResponse], error) {
	err := s.secEngine.SetSecret(ctx, req.Msg.StoreName, req.Msg.SecretKey, req.Msg.SecretValue)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.SetSecretResponse{Success: true}), nil
}

func (s *SecretService) DeleteSecret(ctx context.Context, req *connect.Request[dbmuxv1.DeleteSecretRequest]) (*connect.Response[dbmuxv1.DeleteSecretResponse], error) {
	err := s.secEngine.DeleteSecret(ctx, req.Msg.StoreName, req.Msg.SecretKey)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.DeleteSecretResponse{Success: true}), nil
}


// --- 11. PubSub Service ---

type PubSubService struct {
	engine *pubsub.PubSubEngine
}

var _ dbmuxv1connect.PubSubHandler = (*PubSubService)(nil)

func (s *PubSubService) Publish(ctx context.Context, req *connect.Request[dbmuxv1.PublishRequest]) (*connect.Response[dbmuxv1.PublishResponse], error) {
	if req.Msg.Topic == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("topic is required"))
	}
	n, err := s.engine.Publish(ctx, req.Msg.Topic, req.Msg.Payload)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}
	return connect.NewResponse(&dbmuxv1.PublishResponse{
		Delivered: true,
		Receivers: n,
		Backend:   "redis",
	}), nil
}

func (s *PubSubService) Subscribe(ctx context.Context, req *connect.Request[dbmuxv1.SubscribeRequest], stream *connect.ServerStream[dbmuxv1.SubscribeEvent]) error {
	if req.Msg.Topic == "" {
		return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("topic is required"))
	}

	var subCtx context.Context = ctx
	var cancel context.CancelFunc
	if req.Msg.TimeoutSeconds > 0 {
		subCtx, cancel = context.WithTimeout(ctx, time.Duration(req.Msg.TimeoutSeconds)*time.Second)
		defer cancel()
	}

	err := s.engine.Subscribe(subCtx, req.Msg.Topic, func(topic, payload string, ts time.Time) error {
		return stream.Send(&dbmuxv1.SubscribeEvent{
			Topic:         topic,
			Payload:       payload,
			TimestampUnix: ts.Unix(),
		})
	})
	if err != nil {
		return connect.NewError(connect.CodeUnavailable, err)
	}
	return nil
}

// --- 12. Queue Service ---

type QueueService struct {
	engine *queue.QueueEngine
}

var _ dbmuxv1connect.QueueHandler = (*QueueService)(nil)

func (s *QueueService) Enqueue(ctx context.Context, req *connect.Request[dbmuxv1.EnqueueRequest]) (*connect.Response[dbmuxv1.EnqueueResponse], error) {
	if req.Msg.QueueName == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("queue_name is required"))
	}
	backend, err := s.engine.Enqueue(ctx, req.Msg.QueueName, req.Msg.Payload)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}
	return connect.NewResponse(&dbmuxv1.EnqueueResponse{
		Success: true,
		Backend: backend,
	}), nil
}

func (s *QueueService) Dequeue(ctx context.Context, req *connect.Request[dbmuxv1.DequeueRequest]) (*connect.Response[dbmuxv1.DequeueResponse], error) {
	if req.Msg.QueueName == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("queue_name is required"))
	}
	payload, found, backend, err := s.engine.Dequeue(ctx, req.Msg.QueueName)
	if err != nil {
		return nil, connect.NewError(connect.CodeUnavailable, err)
	}
	return connect.NewResponse(&dbmuxv1.DequeueResponse{
		Found:   found,
		Payload: payload,
		Backend: backend,
	}), nil
}

func (s *QueueService) Size(ctx context.Context, req *connect.Request[dbmuxv1.QueueSizeRequest]) (*connect.Response[dbmuxv1.QueueSizeResponse], error) {
	size, err := s.engine.Size(ctx, req.Msg.QueueName)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.QueueSizeResponse{Size: size}), nil
}

func (s *QueueService) Peek(ctx context.Context, req *connect.Request[dbmuxv1.QueuePeekRequest]) (*connect.Response[dbmuxv1.QueuePeekResponse], error) {
	payload, found, err := s.engine.Peek(ctx, req.Msg.QueueName)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.QueuePeekResponse{Found: found, Payload: payload}), nil
}

func (s *QueueService) Purge(ctx context.Context, req *connect.Request[dbmuxv1.QueuePurgeRequest]) (*connect.Response[dbmuxv1.QueuePurgeResponse], error) {
	err := s.engine.Purge(ctx, req.Msg.QueueName)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&dbmuxv1.QueuePurgeResponse{Success: true}), nil
}
