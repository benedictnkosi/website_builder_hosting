package com.webhosting.deploymentagent.service;

import java.util.Locale;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.webhosting.deploymentagent.config.DeploymentProperties;
import com.webhosting.deploymentagent.dns.DnsQuery;

@Service
public class DnsResolutionService {

    private static final Logger log = LoggerFactory.getLogger(DnsResolutionService.class);

    private final DeploymentProperties deploymentProperties;
    private final DnsQuery dnsQuery;

    public DnsResolutionService(DeploymentProperties deploymentProperties, DnsQuery dnsQuery) {
        this.deploymentProperties = deploymentProperties;
        this.dnsQuery = dnsQuery;
    }

    public boolean isReadyForHttps(String normalizedDomain) {
        return hostPointsHere(normalizedDomain) && hostPointsHere("www." + normalizedDomain);
    }

    boolean hostPointsHere(String hostname) {
        Set<String> addresses = dnsQuery.lookupARecords(hostname);
        if (addresses.isEmpty()) {
            log.info("Public DNS for {} has not propagated yet", hostname);
            return false;
        }

        String expectedIp = DnsResolutionService.normalizeIp(deploymentProperties.getPublicIp());
        if (expectedIp.isEmpty()) {
            log.info("PUBLIC_IP is not set; treating {} as ready because it resolved to {}",
                    hostname, addresses);
            return true;
        }

        boolean match = addresses.stream().map(DnsResolutionService::normalizeIp).anyMatch(expectedIp::equals);
        if (!match) {
            log.info("Public DNS for {} resolved to {} but expected {}", hostname, addresses, expectedIp);
        }
        return match;
    }

    static String normalizeIp(String ip) {
        return ip == null ? "" : ip.trim().toLowerCase(Locale.ROOT);
    }
}
