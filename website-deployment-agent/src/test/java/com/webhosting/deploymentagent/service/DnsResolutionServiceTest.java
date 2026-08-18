package com.webhosting.deploymentagent.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.webhosting.deploymentagent.config.DeploymentProperties;

class DnsResolutionServiceTest {

    @Test
    void requiresApexAndWwwToMatchPublicIp() {
        DeploymentProperties properties = new DeploymentProperties();
        properties.setPublicIp("104.168.134.8");
        DnsResolutionService service = new DnsResolutionService(properties, hostname -> {
            if (hostname.equals("example.com") || hostname.equals("www.example.com")) {
                return Set.of("104.168.134.8");
            }
            return Set.of();
        });

        assertTrue(service.isReadyForHttps("example.com"));
    }

    @Test
    void isNotReadyWhenWwwIsMissing() {
        DeploymentProperties properties = new DeploymentProperties();
        properties.setPublicIp("104.168.134.8");
        DnsResolutionService service = new DnsResolutionService(
                properties,
                hostname -> hostname.equals("example.com") ? Set.of("104.168.134.8") : Set.of());

        assertFalse(service.isReadyForHttps("example.com"));
    }

    @Test
    void isNotReadyWhenIpDoesNotMatch() {
        DeploymentProperties properties = new DeploymentProperties();
        properties.setPublicIp("104.168.134.8");
        DnsResolutionService service = new DnsResolutionService(properties, hostname -> Set.of("1.2.3.4"));

        assertFalse(service.isReadyForHttps("example.com"));
    }

    @Test
    void treatsAnyARecordAsReadyWhenPublicIpIsUnset() {
        DeploymentProperties properties = new DeploymentProperties();
        DnsResolutionService service = new DnsResolutionService(properties, hostname -> Set.of("9.9.9.9"));

        assertTrue(service.isReadyForHttps("example.com"));
    }

    @Test
    void isNotReadyWhenNamesDoNotResolve() {
        DeploymentProperties properties = new DeploymentProperties();
        properties.setPublicIp("104.168.134.8");
        DnsResolutionService service = new DnsResolutionService(properties, hostname -> Set.of());

        assertFalse(service.isReadyForHttps("example.com"));
    }

    @Test
    void followsDifferentRecordsPerHost() {
        DeploymentProperties properties = new DeploymentProperties();
        properties.setPublicIp("104.168.134.8");
        Map<String, Set<String>> records = Map.of(
                "shop.co.za", Set.of("104.168.134.8"),
                "www.shop.co.za", Set.of("104.168.134.8", "127.0.0.1"));
        DnsResolutionService service = new DnsResolutionService(
                properties,
                hostname -> records.getOrDefault(hostname, Set.of()));

        assertTrue(service.isReadyForHttps("shop.co.za"));
    }
}
