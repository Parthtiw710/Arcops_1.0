import json
import urllib.request
import urllib.error

CAP_POSTGRES = 1 << 0  # 1
CAP_MYSQL    = 1 << 1  # 2
CAP_SQLITE   = 1 << 2  # 4
CAP_REDIS    = 1 << 3  # 8
CAP_MONGO    = 1 << 4  # 16
CAP_VECTOR   = 1 << 5  # 32


class DBMuxError(Exception):
    """Base exception for DBMux SDK errors."""
    pass


class DBMuxClient:
    def __init__(self, base_url: str = "http://localhost:8080", service_key: str = None, anon_key: str = None, auth_token: str = None):
        self.base_url = base_url.rstrip("/")
        self.service_key = service_key
        self.anon_key = anon_key
        self.auth_token = auth_token
        self.capabilities_mask = 0

        self.postgres = PostgresSubClient(self)
        self.mysql = MySQLSubClient(self)
        self.sqlite = SQLiteSubClient(self)
        self.redis = RedisSubClient(self)
        self.mongo = MongoSubClient(self)
        self.vector = VectorSubClient(self)
        self.pubsub = PubSubSubClient(self)
        self.queue = QueueSubClient(self)
        self.state = StateSubClient(self)
        self.cron = CronSubClient(self)
        self.secret = SecretSubClient(self)

    def init(self) -> int:
        """Fetch server capabilities bitmask on startup."""
        self._do_request("/dbmux.v1.Registry/ListProviders", {})
        return self.capabilities_mask

    def has_capability(self, cap_bit: int) -> bool:
        return self.capabilities_mask == 0 or (self.capabilities_mask & cap_bit) != 0

    def _do_request(self, path: str, payload: dict) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Connect-Protocol-Version": "1",
        }
        if self.service_key:
            headers["X-Service-Role-Key"] = self.service_key
        if self.anon_key:
            headers["X-Anon-Key"] = self.anon_key
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                cap_header = resp.headers.get("X-DBMux-Capabilities")
                if cap_header:
                    try:
                        self.capabilities_mask = int(cap_header)
                    except ValueError:
                        pass
                resp_bytes = resp.read()
                return json.loads(resp_bytes.decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise DBMuxError(f"RPC {path} failed with HTTP {e.code}: {err_body}")
        except Exception as e:
            raise DBMuxError(f"RPC {path} connection failed: {e}")


# --- Sub-Clients ---

class PostgresSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def query(self, provider_id: str, query: str, params: list = None) -> dict:
        if not self._client.has_capability(CAP_POSTGRES):
            raise DBMuxError("[DBMux SDK] PostgreSQL provider is not configured on server")
        return self._client._do_request("/dbmux.v1.Postgres/Query", {
            "provider_id": provider_id,
            "query": query,
            "params": params or [],
        })

    def exec(self, provider_id: str, query: str, params: list = None) -> dict:
        if not self._client.has_capability(CAP_POSTGRES):
            raise DBMuxError("[DBMux SDK] PostgreSQL provider is not configured on server")
        return self._client._do_request("/dbmux.v1.Postgres/Exec", {
            "provider_id": provider_id,
            "query": query,
            "params": params or [],
        })


class MySQLSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def query(self, provider_id: str, query: str, params: list = None) -> dict:
        if not self._client.has_capability(CAP_MYSQL):
            raise DBMuxError("[DBMux SDK] MySQL provider is not configured on server")
        return self._client._do_request("/dbmux.v1.MySQL/Query", {
            "provider_id": provider_id,
            "query": query,
            "params": params or [],
        })

    def exec(self, provider_id: str, query: str, params: list = None) -> dict:
        if not self._client.has_capability(CAP_MYSQL):
            raise DBMuxError("[DBMux SDK] MySQL provider is not configured on server")
        return self._client._do_request("/dbmux.v1.MySQL/Exec", {
            "provider_id": provider_id,
            "query": query,
            "params": params or [],
        })


class SQLiteSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def query(self, provider_id: str, query: str, params: list = None) -> dict:
        if not self._client.has_capability(CAP_SQLITE):
            raise DBMuxError("[DBMux SDK] SQLite provider is not configured on server")
        return self._client._do_request("/dbmux.v1.SQLite/Query", {
            "provider_id": provider_id,
            "query": query,
            "params": params or [],
        })

    def exec(self, provider_id: str, query: str, params: list = None) -> dict:
        if not self._client.has_capability(CAP_SQLITE):
            raise DBMuxError("[DBMux SDK] SQLite provider is not configured on server")
        return self._client._do_request("/dbmux.v1.SQLite/Exec", {
            "provider_id": provider_id,
            "query": query,
            "params": params or [],
        })


class RedisSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def get(self, key: str, provider_id: str = "redis") -> dict:
        if not self._client.has_capability(CAP_REDIS):
            raise DBMuxError("[DBMux SDK] Redis/Valkey provider is not configured on server")
        return self._client._do_request("/dbmux.v1.KV/Get", {"provider_id": provider_id, "key": key})

    def set(self, key: str, value: str, ttl_seconds: int = 0, provider_id: str = "redis") -> dict:
        if not self._client.has_capability(CAP_REDIS):
            raise DBMuxError("[DBMux SDK] Redis/Valkey provider is not configured on server")
        return self._client._do_request("/dbmux.v1.KV/Set", {
            "provider_id": provider_id,
            "key": key,
            "value": value,
            "ttl_seconds": ttl_seconds,
        })

    def del_key(self, key: str, provider_id: str = "redis") -> dict:
        if not self._client.has_capability(CAP_REDIS):
            raise DBMuxError("[DBMux SDK] Redis/Valkey provider is not configured on server")
        return self._client._do_request("/dbmux.v1.KV/Del", {"provider_id": provider_id, "key": key})


class MongoSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def find(self, db_name: str, collection: str, filter_json: str, limit: int = 100, provider_id: str = "mongo") -> dict:
        if not self._client.has_capability(CAP_MONGO):
            raise DBMuxError("[DBMux SDK] MongoDB provider is not configured on server")
        return self._client._do_request("/dbmux.v1.Mongo/DocFind", {
            "provider_id": provider_id,
            "db_name": db_name,
            "collection": collection,
            "filter_json": filter_json,
            "limit": limit,
        })

    def insert(self, db_name: str, collection: str, document_json: str, provider_id: str = "mongo") -> dict:
        if not self._client.has_capability(CAP_MONGO):
            raise DBMuxError("[DBMux SDK] MongoDB provider is not configured on server")
        return self._client._do_request("/dbmux.v1.Mongo/Insert", {
            "provider_id": provider_id,
            "db_name": db_name,
            "collection": collection,
            "document_json": document_json,
        })


class VectorSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def search(self, collection: str, vector: list, limit: int = 10, provider_id: str = "qdrant") -> dict:
        if not self._client.has_capability(CAP_VECTOR):
            raise DBMuxError("[DBMux SDK] Vector provider is not configured on server")
        return self._client._do_request("/dbmux.v1.Vector/VectorSearch", {
            "provider_id": provider_id,
            "collection_name": collection,
            "vector": vector,
            "limit": limit,
        })

    def insert(self, collection: str, point_id: str, vector: list, payload: dict = None, provider_id: str = "qdrant") -> dict:
        if not self._client.has_capability(CAP_VECTOR):
            raise DBMuxError("[DBMux SDK] Vector provider is not configured on server")
        return self._client._do_request("/dbmux.v1.Vector/Insert", {
            "provider_id": provider_id,
            "collection_name": collection,
            "point_id": point_id,
            "vector": vector,
            "payload": payload or {},
        })


class PubSubSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def publish(self, topic: str, payload: str) -> dict:
        if not self._client.has_capability(CAP_REDIS):
            raise DBMuxError("[DBMux SDK] Redis/Valkey provider is not configured on server for PubSub")
        return self._client._do_request("/dbmux.v1.PubSub/Publish", {
            "topic": topic,
            "payload": payload,
        })

    def subscribe(self, topic: str, timeout_seconds: int = 0) -> dict:
        if not self._client.has_capability(CAP_REDIS):
            raise DBMuxError("[DBMux SDK] Redis/Valkey provider is not configured on server for PubSub")
        return self._client._do_request("/dbmux.v1.PubSub/Subscribe", {
            "topic": topic,
            "timeout_seconds": timeout_seconds,
        })


class QueueSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def enqueue(self, queue_name: str, payload: str) -> dict:
        if not self._client.has_capability(CAP_REDIS) and not self._client.has_capability(CAP_POSTGRES):
            raise DBMuxError("[DBMux SDK] Neither Redis nor Postgres provider is configured for Queue")
        return self._client._do_request("/dbmux.v1.Queue/Enqueue", {
            "queue_name": queue_name,
            "payload": payload,
        })

    def dequeue(self, queue_name: str) -> dict:
        if not self._client.has_capability(CAP_REDIS) and not self._client.has_capability(CAP_POSTGRES):
            raise DBMuxError("[DBMux SDK] Neither Redis nor Postgres provider is configured for Queue")
        return self._client._do_request("/dbmux.v1.Queue/Dequeue", {
            "queue_name": queue_name,
        })


class StateSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def save_state(self, key: str, val_json: str, ttl_seconds: int = 3600, store_name: str = "default") -> dict:
        return self._client._do_request("/dbmux.v1.State/SaveState", {
            "store_name": store_name,
            "key": key,
            "value_json": val_json,
            "ttl_seconds": ttl_seconds,
        })

    def get_state(self, key: str, store_name: str = "default") -> dict:
        return self._client._do_request("/dbmux.v1.State/GetState", {
            "store_name": store_name,
            "key": key,
        })

    def delete_state(self, key: str, store_name: str = "default") -> dict:
        return self._client._do_request("/dbmux.v1.State/DeleteState", {
            "store_name": store_name,
            "key": key,
        })


class CronSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def register(self, cron_id: str, schedule: str, payload_json: str = "") -> dict:
        return self._client._do_request("/dbmux.v1.Cron/RegisterCron", {
            "cron_id": cron_id,
            "schedule": schedule,
            "payload_json": payload_json,
        })

    def trigger(self, cron_id: str) -> dict:
        return self._client._do_request("/dbmux.v1.Cron/TriggerCron", {
            "cron_id": cron_id,
        })


class SecretSubClient:
    def __init__(self, client: DBMuxClient):
        self._client = client

    def get_secret(self, store_name: str, secret_key: str) -> dict:
        return self._client._do_request("/dbmux.v1.Secret/GetSecret", {
            "store_name": store_name,
            "secret_key": secret_key,
        })

    def get_bulk_secrets(self, store_name: str) -> dict:
        return self._client._do_request("/dbmux.v1.Secret/GetBulkSecrets", {
            "store_name": store_name,
        })

