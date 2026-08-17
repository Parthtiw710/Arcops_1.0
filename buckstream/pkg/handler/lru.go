package handler

import (
	"sync"
	"time"
)

// lruNode represents a node in the doubly linked list of the LRU cache.
type lruNode struct {
	key          string
	value        map[string]cachedFile
	lastAccessed time.Time
	prev         *lruNode
	next         *lruNode
}

// LRUCache implements a thread-safe Least Recently Used (LRU) cache with expiration support.
type LRUCache struct {
	capacity int
	items    map[string]*lruNode
	head     *lruNode
	tail     *lruNode
	mu       sync.Mutex
}

// NewLRUCache instantiates a new LRUCache with the given capacity.
func NewLRUCache(capacity int) *LRUCache {
	return &LRUCache{
		capacity: capacity,
		items:    make(map[string]*lruNode),
	}
}

// Get retrieves a value from the cache and updates its eviction status and lastAccessed time.
func (c *LRUCache) Get(key string) (map[string]cachedFile, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	node, exists := c.items[key]
	if !exists {
		return nil, false
	}

	node.lastAccessed = time.Now()
	c.moveToFront(node)
	return node.value, true
}

// Put inserts or updates a value in the cache, evicting the oldest items if capacity is exceeded.
func (c *LRUCache) Put(key string, value map[string]cachedFile) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	if node, exists := c.items[key]; exists {
		node.value = value
		node.lastAccessed = now
		c.moveToFront(node)
		return
	}

	newNode := &lruNode{
		key:          key,
		value:        value,
		lastAccessed: now,
	}

	c.items[key] = newNode
	c.addToFront(newNode)

	if len(c.items) > c.capacity {
		c.evict()
	}
}

// EvictExpired deletes all cache entries that haven't been accessed within the duration of the TTL.
// It starts from the tail (least recently accessed) and stops at the first non-expired node, running in O(1) commonly.
func (c *LRUCache) EvictExpired(ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for c.tail != nil && now.Sub(c.tail.lastAccessed) > ttl {
		delete(c.items, c.tail.key)
		c.removeNode(c.tail)
	}
}

// Delete removes an item from the cache.
func (c *LRUCache) Delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	node, exists := c.items[key]
	if !exists {
		return
	}

	c.removeNode(node)
	delete(c.items, key)
}

func (c *LRUCache) moveToFront(node *lruNode) {
	c.removeNode(node)
	c.addToFront(node)
}

func (c *LRUCache) addToFront(node *lruNode) {
	node.next = c.head
	node.prev = nil

	if c.head != nil {
		c.head.prev = node
	}
	c.head = node

	if c.tail == nil {
		c.tail = node
	}
}

func (c *LRUCache) removeNode(node *lruNode) {
	if node.prev != nil {
		node.prev.next = node.next
	} else {
		c.head = node.next
	}

	if node.next != nil {
		node.next.prev = node.prev
	} else {
		c.tail = node.prev
	}
}

func (c *LRUCache) evict() {
	if c.tail == nil {
		return
	}
	delete(c.items, c.tail.key)
	c.removeNode(c.tail)
}
