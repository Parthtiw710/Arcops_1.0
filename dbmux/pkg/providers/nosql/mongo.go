package nosql

import (
	"context"
	"encoding/json"
	"fmt"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

// MongoProvider manages connection pools to MongoDB / MongoDB Atlas.
type MongoProvider struct {
	id     string
	client *mongo.Client
}

var _ providers.NoSQLProvider = (*MongoProvider)(nil)

// NewMongoProvider initializes a MongoDB client pool with mongo-driver/v2.
func NewMongoProvider(ctx context.Context, id, dsn string) (*MongoProvider, error) {
	clientOpts := options.Client().ApplyURI(dsn).SetMaxPoolSize(50)
	client, err := mongo.Connect(clientOpts)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to mongodb: %w", err)
	}

	return &MongoProvider{
		id:     id,
		client: client,
	}, nil
}

func (p *MongoProvider) ID() string {
	return p.id
}

func (p *MongoProvider) Category() dbmuxv1.DBCategory {
	return dbmuxv1.DBCategory_DB_CATEGORY_MONGO
}

func (p *MongoProvider) DocFind(ctx context.Context, dbName, collection, filterJSON string, limit int64) (*dbmuxv1.MongoFindResponse, error) {
	coll := p.client.Database(dbName).Collection(collection)

	var filter any = bson.M{}
	if filterJSON != "" && filterJSON != "{}" {
		var raw bson.M
		if err := bson.UnmarshalExtJSON([]byte(filterJSON), true, &raw); err != nil {
			if errJson := json.Unmarshal([]byte(filterJSON), &raw); errJson != nil {
				return nil, fmt.Errorf("failed to parse mongo filter JSON: %w", err)
			}
		}
		filter = raw
	}

	findOpts := options.Find()
	if limit > 0 {
		findOpts.SetLimit(limit)
	}

	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		return nil, fmt.Errorf("mongo find query failed: %w", err)
	}
	defer cursor.Close(ctx)

	var docs []string
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return nil, fmt.Errorf("failed to decode mongo document: %w", err)
		}

		jsonBytes, err := bson.MarshalExtJSON(doc, true, false)
		if err != nil {
			jsonBytes, _ = json.Marshal(doc)
		}
		docs = append(docs, string(jsonBytes))
	}

	if err := cursor.Err(); err != nil {
		return nil, fmt.Errorf("mongo cursor error: %w", err)
	}

	return &dbmuxv1.MongoFindResponse{
		DocumentsJson: docs,
	}, nil
}

func (p *MongoProvider) DocInsert(ctx context.Context, dbName, collection, docJSON string) (*dbmuxv1.MongoInsertResponse, error) {
	coll := p.client.Database(dbName).Collection(collection)

	var doc bson.M
	if err := bson.UnmarshalExtJSON([]byte(docJSON), true, &doc); err != nil {
		if errJson := json.Unmarshal([]byte(docJSON), &doc); errJson != nil {
			return nil, fmt.Errorf("failed to parse mongo document JSON: %w", err)
		}
	}

	res, err := coll.InsertOne(ctx, doc)
	if err != nil {
		return nil, fmt.Errorf("mongo insert failed: %w", err)
	}

	insertedIDStr := fmt.Sprintf("%v", res.InsertedID)

	return &dbmuxv1.MongoInsertResponse{
		Success:    true,
		InsertedId: insertedIDStr,
	}, nil
}

func (p *MongoProvider) DocUpdate(ctx context.Context, dbName, collection, filterJSON, updateJSON string) (int64, error) {
	coll := p.client.Database(dbName).Collection(collection)
	var filter bson.M
	if err := json.Unmarshal([]byte(filterJSON), &filter); err != nil {
		filter = bson.M{}
	}
	var update bson.M
	if err := json.Unmarshal([]byte(updateJSON), &update); err != nil {
		return 0, fmt.Errorf("invalid mongo update JSON: %w", err)
	}
	res, err := coll.UpdateMany(ctx, filter, update)
	if err != nil {
		return 0, err
	}
	return res.ModifiedCount, nil
}

func (p *MongoProvider) DocDelete(ctx context.Context, dbName, collection, filterJSON string) (int64, error) {
	coll := p.client.Database(dbName).Collection(collection)
	var filter bson.M
	if err := json.Unmarshal([]byte(filterJSON), &filter); err != nil {
		filter = bson.M{}
	}
	res, err := coll.DeleteMany(ctx, filter)
	if err != nil {
		return 0, err
	}
	return res.DeletedCount, nil
}

func (p *MongoProvider) DocCount(ctx context.Context, dbName, collection, filterJSON string) (int64, error) {
	coll := p.client.Database(dbName).Collection(collection)
	var filter bson.M
	if err := json.Unmarshal([]byte(filterJSON), &filter); err != nil {
		filter = bson.M{}
	}
	return coll.CountDocuments(ctx, filter)
}

func (p *MongoProvider) Close() error {
	if p.client != nil {
		return p.client.Disconnect(context.Background())
	}
	return nil
}
