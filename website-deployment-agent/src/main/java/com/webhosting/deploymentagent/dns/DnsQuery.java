package com.webhosting.deploymentagent.dns;

import java.util.Set;

@FunctionalInterface
public interface DnsQuery {

    Set<String> lookupARecords(String hostname);
}
