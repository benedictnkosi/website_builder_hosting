package com.webhosting.deploymentagent.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.webhosting.deploymentagent.exception.InvalidDomainException;

class DomainValidationServiceTest {

    private DomainValidationService domainValidationService;

    @BeforeEach
    void setUp() {
        domainValidationService = new DomainValidationService();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "thandoplumbing.co.za",
            "www.thandoplumbing.co.za",
            "example.com",
            "example.co.za"
    })
    void acceptsValidDomains(String domain) {
        String normalized = domainValidationService.validateAndNormalize(domain);
        assertEquals(domain.toLowerCase().replace("www.", ""), normalized);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "../../etc/passwd",
            "/etc/passwd",
            "localhost",
            "127.0.0.1",
            "domain;rm -rf /",
            "domain && command",
            "",
            "   ",
            "not-a-domain",
            "example..com"
    })
    void rejectsInvalidDomains(String domain) {
        assertThrows(InvalidDomainException.class,
                () -> domainValidationService.validateAndNormalize(domain));
    }

    @Test
    void normalizesDomainToLowercase() {
        assertEquals("example.com", domainValidationService.validateAndNormalize("EXAMPLE.COM"));
    }

    @Test
    void stripsLeadingWww() {
        assertEquals("example.com", domainValidationService.validateAndNormalize("www.example.com"));
    }

    @Test
    void configFilenameIsDeterministic() {
        assertEquals("thandoplumbing.co.za.caddy",
                domainValidationService.toConfigFilename("thandoplumbing.co.za"));
    }
}
