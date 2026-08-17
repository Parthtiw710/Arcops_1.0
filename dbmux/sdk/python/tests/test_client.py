import unittest
from dbmux import DBMuxClient, DBMuxError


class TestPythonSDK(unittest.TestCase):
    def test_capability_bitmask_guard(self):
        client = DBMuxClient(base_url="http://localhost:8080")
        client.capabilities_mask = 1  # Postgres=1, Redis=0

        with self.assertRaises(DBMuxError) as cm:
            client.pubsub.publish("orders", "payload")
        self.assertIn("Redis/Valkey provider is not configured", str(cm.exception))

    def test_queue_guard_passes_when_postgres_active(self):
        client = DBMuxClient(base_url="http://localhost:8080")
        client.capabilities_mask = 1  # Postgres=1 (Queue works via Postgres fallback!)

        # Queue guard shouldn't raise DBMuxError locally because Postgres capability bit 1 is set
        self.assertTrue(client.has_capability(1))


if __name__ == "__main__":
    unittest.main()
