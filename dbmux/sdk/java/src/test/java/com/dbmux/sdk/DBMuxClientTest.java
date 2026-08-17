package com.dbmux.sdk;

public class DBMuxClientTest {
    public static void main(String[] args) {
        DBMuxClient client = new DBMuxClient("http://localhost:8080", "admin_key");
        // Manually test capability guard (capMask = 1: Postgres=1, Redis=0)
        // Set internal mask via reflection or check init logic
        if (!client.hasCapability(DBMuxClient.CAP_POSTGRES)) {
            throw new RuntimeException("Postgres capability check failed");
        }
        System.out.println("✅ Java SDK Unit Test Passed!");
    }
}
