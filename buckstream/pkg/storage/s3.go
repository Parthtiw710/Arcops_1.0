package storage

import (
	"context"
	"fmt"
	"io"
	"time"

	appconfig "BuckStream/pkg/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/transfermanager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Provider struct {
	client        *s3.Client
	presignClient *s3.PresignClient
}

// NewS3Provider creates and returns a fully initialized S3Provider.
// It decides whether to use keyless IAM roles or custom S3 tokens based on configuration.
func NewS3Provider(ctx context.Context, cfg *appconfig.Config) (*S3Provider, error) {
	var s3Client *s3.Client
	var err error

	if cfg.S3ByIAM {
		s3Client, err = InitS3WithIAM(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize AWS S3 via IAM: %w", err)
		}
	} else if cfg.S3CompatibleByToken {
		s3Client, err = InitS3CompatibleWithToken(
			ctx,
			cfg.S3CompatibleEndpoint,
			cfg.S3CompatibleRegion,
			cfg.S3CompatibleAccessKey,
			cfg.S3CompatibleAccessSecret,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to initialize S3 compatible token client: %w", err)
		}
	} else {
		return nil, fmt.Errorf("neither S3_BY_IAM nor S3_COMPATIBLE_BY_TOKEN is enabled")
	}

	return &S3Provider{
		client:        s3Client,
		presignClient: s3.NewPresignClient(s3Client),
	}, nil
}

// InitS3WithIAM initializes standard AWS S3 client using IAM Role / instance metadata.
func InitS3WithIAM(ctx context.Context) (*s3.Client, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, err
	}
	return s3.NewFromConfig(cfg), nil
}

// InitS3CompatibleWithToken initializes S3-compatible clients (R2, Wasabi, B2) using custom endpoints and static keys.
func InitS3CompatibleWithToken(ctx context.Context, endpoint, region, accessKey, secretKey string) (*s3.Client, error) {
	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKey,
			secretKey,
			"",
		)),
	)
	if err != nil {
		return nil, err
	}

	s3Client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	return s3Client, nil
}

// GenerateUploadURL creates a presigned PUT URL for files > 5MB.
func (s *S3Provider) GenerateUploadURL(ctx context.Context, intent UploadIntent) (string, error) {
	req, err := s.presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(intent.Bucket),
		Key:         aws.String(intent.Key),
		ContentType: aws.String(intent.ContentType),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = intent.Expires
	})
	if err != nil {
		return "", fmt.Errorf("failed to presign put object: %w", err)
	}
	return req.URL, nil
}

// UploadStream uploads a streamed file directly from the broker to S3.
func (s *S3Provider) UploadStream(ctx context.Context, intent UploadIntent, reader io.Reader) error {
	tm := transfermanager.New(s.client)
	_, err := tm.UploadObject(ctx, &transfermanager.UploadObjectInput{
		Bucket:      aws.String(intent.Bucket),
		Key:         aws.String(intent.Key),
		Body:        reader,
		ContentType: aws.String(intent.ContentType),
	})
	if err != nil {
		return fmt.Errorf("failed to upload stream: %w", err)
	}
	return nil
}

func (s *S3Provider) GenerateDownloadURL(ctx context.Context, bucket, key string, expires time.Duration) (string, error) {
	req, err := s.presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) { opts.Expires = expires })

	if err != nil {
		return "", fmt.Errorf("failed to presign get object: %w", err)
	}
	return req.URL, nil
}

// DownloadStream retrieves the file stream and metadata directly from S3 for proxying.
func (s *S3Provider) DownloadStream(ctx context.Context, bucket, key string) (io.ReadCloser, *ObjectMetadata, error) {
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get object from S3: %w", err)
	}

	meta := &ObjectMetadata{
		ContentType:   aws.ToString(output.ContentType),
		ContentLength: aws.ToInt64(output.ContentLength),
		ETag:          aws.ToString(output.ETag),
	}
	if output.LastModified != nil {
		meta.LastModified = *output.LastModified
	}

	return output.Body, meta, nil
}

// GetStaticWebsiteURL returns the raw S3 website hosting domain name.
func (s *S3Provider) GetStaticWebsiteURL(bucket, siteID string) (string, error) {
	// If a custom BaseEndpoint is set, it means it is a custom S3-compatible provider
	if s.client.Options().BaseEndpoint != nil {
		endpoint := *s.client.Options().BaseEndpoint
		return endpoint, nil
	}

	// Standard AWS S3 website endpoint
	region := s.client.Options().Region
	if region == "" {
		region = "ap-south-1"
	}
	return fmt.Sprintf("%s.s3-website.%s.amazonaws.com", bucket, region), nil
}

func (s *S3Provider) DeleteObject(ctx context.Context, bucket, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return err
}

func (s *S3Provider) ListObjects(ctx context.Context, bucket, prefix string) ([]string, error) {
	var keys []string
	paginator := s3.NewListObjectsV2Paginator(s.client, &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
		Prefix: aws.String(prefix),
	})

	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("failed to list S3 objects: %w", err)
		}
		for _, obj := range page.Contents {
			if obj.Key != nil {
				keys = append(keys, *obj.Key)
			}
		}
	}
	return keys, nil
}
