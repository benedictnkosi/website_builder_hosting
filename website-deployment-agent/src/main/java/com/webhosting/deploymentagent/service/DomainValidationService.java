package com.webhosting.deploymentagent.service;

import java.net.InetAddress;
import java.util.Locale;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.webhosting.deploymentagent.exception.InvalidDomainException;

@Service
public class DomainValidationService {

    private static final Pattern VALID_HOSTNAME = Pattern.compile(
            "^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern DANGEROUS_CHARACTERS = Pattern.compile("[/\\\\;|&$`<>{}\\s]");

    public String validateAndNormalize(String domain) {
        if (domain == null || domain.isBlank()) {
            throw new InvalidDomainException("The supplied domain is invalid");
        }

        String normalized = domain.trim().toLowerCase(Locale.ROOT);

        if (normalized.startsWith("www.")) {
            normalized = normalized.substring(4);
        }

        if (normalized.equals("localhost")) {
            throw new InvalidDomainException("The supplied domain is invalid");
        }

        if (DANGEROUS_CHARACTERS.matcher(normalized).find()) {
            throw new InvalidDomainException("The supplied domain is invalid");
        }

        if (normalized.contains("..")) {
            throw new InvalidDomainException("The supplied domain is invalid");
        }

        if (isIpAddress(normalized)) {
            throw new InvalidDomainException("The supplied domain is invalid");
        }

        if (!VALID_HOSTNAME.matcher(normalized).matches()) {
            throw new InvalidDomainException("The supplied domain is invalid");
        }

        return normalized;
    }

    public String toConfigFilename(String normalizedDomain) {
        return normalizedDomain + ".caddy";
    }

    private boolean isIpAddress(String value) {
        try {
            InetAddress address = InetAddress.getByName(value);
            return address.getHostAddress().equals(value)
                    || address.getHostAddress().equals(value.replaceAll("^\\[|\\]$", ""));
        } catch (Exception ex) {
            return false;
        }
    }
}
