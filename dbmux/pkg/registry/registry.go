package registry

import (
	"fmt"
	"sync"

	dbmuxv1 "dbmux/gen/dbmux/v1"
	"dbmux/pkg/providers"
)

// Registry maintains a thread-safe registry of registered database provider instances.
type Registry struct {
	mu        sync.RWMutex
	providers map[string]providers.Provider
}

// NewRegistry creates a new initialized Provider Registry.
func NewRegistry() *Registry {
	return &Registry{
		providers: make(map[string]providers.Provider),
	}
}

// Register adds or updates a provider instance in the thread-safe map.
func (r *Registry) Register(p providers.Provider) error {
	if p == nil || p.ID() == "" {
		return fmt.Errorf("invalid provider instance")
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	// If a provider with the same ID exists, close it cleanly first
	if existing, ok := r.providers[p.ID()]; ok {
		_ = existing.Close()
	}

	r.providers[p.ID()] = p
	return nil
}

// Get retrieves a provider instance by ID.
func (r *Registry) Get(id string) (providers.Provider, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	p, ok := r.providers[id]
	return p, ok
}

const (
	CapPostgres uint32 = 1 << 0 // 1
	CapMySQL    uint32 = 1 << 1 // 2
	CapSQLite   uint32 = 1 << 2 // 4
	CapRedis    uint32 = 1 << 3 // 8
	CapMongo    uint32 = 1 << 4 // 16
	CapVector   uint32 = 1 << 5 // 32
)

// CapabilityMask returns the 6-bit binary mask representing active provider categories.
func (r *Registry) CapabilityMask() uint32 {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var mask uint32
	for _, p := range r.providers {
		switch p.Category() {
		case dbmuxv1.DBCategory_DB_CATEGORY_POSTGRES:
			mask |= CapPostgres
		case dbmuxv1.DBCategory_DB_CATEGORY_MYSQL:
			mask |= CapMySQL
		case dbmuxv1.DBCategory_DB_CATEGORY_SQLITE:
			mask |= CapSQLite
		case dbmuxv1.DBCategory_DB_CATEGORY_REDIS:
			mask |= CapRedis
		case dbmuxv1.DBCategory_DB_CATEGORY_MONGO:
			mask |= CapMongo
		default:
			mask |= CapVector
		}
	}
	return mask
}

// List returns summary information for all registered providers.
func (r *Registry) List() []*dbmuxv1.ProviderInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	list := make([]*dbmuxv1.ProviderInfo, 0, len(r.providers))
	for id, p := range r.providers {
		list = append(list, &dbmuxv1.ProviderInfo{
			ProviderId: id,
			Category:   p.Category(),
			TlsEnabled: true,
		})
	}
	return list
}

// Unregister closes and removes a provider from the registry.
func (r *Registry) Unregister(id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if p, ok := r.providers[id]; ok {
		err := p.Close()
		delete(r.providers, id)
		return err
	}
	return fmt.Errorf("provider %s not found", id)
}

// CloseAll closes all registered provider connections on shutdown.
func (r *Registry) CloseAll() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for id, p := range r.providers {
		_ = p.Close()
		delete(r.providers, id)
	}
}
