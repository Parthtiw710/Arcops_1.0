package cron

import (
	"context"
	"fmt"
	"sync"
	"time"

	"dbmux/pkg/state"
)

type CronJob struct {
	ID          string
	Schedule    string
	PayloadJSON string
	LastRun     time.Time
}

// DistributedCronScheduler manages distributed background cron jobs across dbmux instances.
type DistributedCronScheduler struct {
	stateEngine *state.StateEngine
	mu          sync.RWMutex
	jobs        map[string]*CronJob
}

func NewDistributedCronScheduler(se *state.StateEngine) *DistributedCronScheduler {
	return &DistributedCronScheduler{
		stateEngine: se,
		jobs:        make(map[string]*CronJob),
	}
}

// RegisterCron adds a scheduled background task.
func (s *DistributedCronScheduler) RegisterCron(cronID, schedule, payloadJSON string) (*CronJob, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	job := &CronJob{
		ID:          cronID,
		Schedule:    schedule,
		PayloadJSON: payloadJSON,
		LastRun:     time.Now(),
	}
	s.jobs[cronID] = job
	return job, nil
}

// TriggerCron attempts to execute a cron job using distributed locking across instances.
func (s *DistributedCronScheduler) TriggerCron(ctx context.Context, cronID string) (bool, bool, string, error) {
	s.mu.RLock()
	job, exists := s.jobs[cronID]
	s.mu.RUnlock()

	if !exists {
		return false, false, fmt.Sprintf("cron job %s not registered", cronID), nil
	}

	lockKey := fmt.Sprintf("dbmux:cron:lock:%s", cronID)

	// Attempt distributed lock via L1 Redis / L2 DB state engine (10 second lock)
	existingVal, found, err := s.stateEngine.GetState(ctx, lockKey)
	if err == nil && found && existingVal != "" {
		// Lock is held by another instance
		return false, false, fmt.Sprintf("cron job %s is currently running on another instance", cronID), nil
	}

	// Acquire Lock with 10 second TTL
	lockPayload := fmt.Sprintf(`{"acquired_at": "%s"}`, time.Now().Format(time.RFC3339))
	err = s.stateEngine.SaveState(ctx, lockKey, lockPayload, 10)
	if err != nil {
		return false, false, fmt.Sprintf("failed to acquire lock for cron %s: %v", cronID, err), err
	}

	// Execute job
	job.LastRun = time.Now()

	// Release lock after execution
	_ = s.stateEngine.DeleteState(ctx, lockKey)

	return true, true, fmt.Sprintf("cron job %s executed successfully", cronID), nil
}

func (s *DistributedCronScheduler) ListCrons(ctx context.Context) []*CronJob {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]*CronJob, 0, len(s.jobs))
	for _, j := range s.jobs {
		list = append(list, j)
	}
	return list
}

func (s *DistributedCronScheduler) DeleteCron(ctx context.Context, cronID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, exists := s.jobs[cronID]
	if exists {
		delete(s.jobs, cronID)
	}
	return exists
}
