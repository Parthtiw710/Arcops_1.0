package dbmuxv1

// --- KV Extra Messages ---
type KVExistsRequest struct {
	ProviderId string `json:"provider_id,omitempty"`
	Key        string `json:"key,omitempty"`
}

type KVExistsResponse struct {
	Exists bool `json:"exists,omitempty"`
}

type KVExpireRequest struct {
	ProviderId string `json:"provider_id,omitempty"`
	Key        string `json:"key,omitempty"`
	TtlSeconds int64  `json:"ttl_seconds,omitempty"`
}

type KVExpireResponse struct {
	Success bool `json:"success,omitempty"`
}

type KVIncrRequest struct {
	ProviderId string `json:"provider_id,omitempty"`
	Key        string `json:"key,omitempty"`
	Delta      int64  `json:"delta,omitempty"`
}

type KVIncrResponse struct {
	Value int64 `json:"value,omitempty"`
}

// --- Mongo Extra Messages ---
type MongoUpdateRequest struct {
	ProviderId string `json:"provider_id,omitempty"`
	DbName     string `json:"db_name,omitempty"`
	Collection string `json:"collection,omitempty"`
	FilterJson string `json:"filter_json,omitempty"`
	UpdateJson string `json:"update_json,omitempty"`
}

type MongoUpdateResponse struct {
	ModifiedCount int64 `json:"modified_count,omitempty"`
}

type MongoDeleteRequest struct {
	ProviderId string `json:"provider_id,omitempty"`
	DbName     string `json:"db_name,omitempty"`
	Collection string `json:"collection,omitempty"`
	FilterJson string `json:"filter_json,omitempty"`
}

type MongoDeleteResponse struct {
	DeletedCount int64 `json:"deleted_count,omitempty"`
}

type MongoCountRequest struct {
	ProviderId string `json:"provider_id,omitempty"`
	DbName     string `json:"db_name,omitempty"`
	Collection string `json:"collection,omitempty"`
	FilterJson string `json:"filter_json,omitempty"`
}

type MongoCountResponse struct {
	Count int64 `json:"count,omitempty"`
}

// --- Secret Extra Messages ---
type SetSecretRequest struct {
	StoreName   string `json:"store_name,omitempty"`
	SecretKey   string `json:"secret_key,omitempty"`
	SecretValue string `json:"secret_value,omitempty"`
}

type SetSecretResponse struct {
	Success bool `json:"success,omitempty"`
}

type DeleteSecretRequest struct {
	StoreName string `json:"store_name,omitempty"`
	SecretKey string `json:"secret_key,omitempty"`
}

type DeleteSecretResponse struct {
	Success bool `json:"success,omitempty"`
}

// --- Queue Extra Messages ---
type QueueSizeRequest struct {
	QueueName string `json:"queue_name,omitempty"`
}

type QueueSizeResponse struct {
	Size int64 `json:"size,omitempty"`
}

type QueuePeekRequest struct {
	QueueName string `json:"queue_name,omitempty"`
}

type QueuePeekResponse struct {
	Found   bool   `json:"found,omitempty"`
	Payload string `json:"payload,omitempty"`
}

type QueuePurgeRequest struct {
	QueueName string `json:"queue_name,omitempty"`
}

type QueuePurgeResponse struct {
	Success bool `json:"success,omitempty"`
}

// --- Cron Extra Messages ---
type CronListRequest struct{}

type CronJobInfo struct {
	CronId      string `json:"cron_id,omitempty"`
	Schedule    string `json:"schedule,omitempty"`
	PayloadJson string `json:"payload_json,omitempty"`
	LastRun     string `json:"last_run,omitempty"`
}

type CronListResponse struct {
	Jobs []*CronJobInfo `json:"jobs,omitempty"`
}

type CronDeleteRequest struct {
	CronId string `json:"cron_id,omitempty"`
}

type CronDeleteResponse struct {
	Success bool `json:"success,omitempty"`
}
