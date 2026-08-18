package com.webhosting.deploymentagent.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ApiKeyFilterTest {

    @Test
    void constantTimeEqualsMatchesIdenticalKeys() {
        assertTrue(ApiKeyFilter.constantTimeEquals("development-key", "development-key"));
    }

    @Test
    void constantTimeEqualsRejectsDifferentKeys() {
        assertFalse(ApiKeyFilter.constantTimeEquals("development-key", "wrong-key"));
    }
}
