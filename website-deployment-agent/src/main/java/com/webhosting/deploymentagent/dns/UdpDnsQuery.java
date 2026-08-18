package com.webhosting.deploymentagent.dns;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.webhosting.deploymentagent.config.DeploymentProperties;

@Component
public class UdpDnsQuery implements DnsQuery {

    private static final Logger log = LoggerFactory.getLogger(UdpDnsQuery.class);
    private static final int DNS_PORT = 53;
    private static final int TYPE_A = 1;
    private static final int TYPE_CNAME = 5;
    private static final int CLASS_IN = 1;

    private final DeploymentProperties deploymentProperties;

    public UdpDnsQuery(DeploymentProperties deploymentProperties) {
        this.deploymentProperties = deploymentProperties;
    }

    @Override
    public Set<String> lookupARecords(String hostname) {
        String normalized = hostname == null ? "" : hostname.trim().toLowerCase(Locale.ROOT);
        if (normalized.endsWith(".")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        if (normalized.isEmpty()) {
            return Set.of();
        }

        Set<String> addresses = new LinkedHashSet<>();
        for (String resolver : deploymentProperties.getDnsResolvers()) {
            try {
                addresses.addAll(lookupARecords(normalized, resolver, 0));
                if (!addresses.isEmpty()) {
                    return addresses;
                }
            } catch (Exception ex) {
                log.debug("DNS lookup for {} via {} failed: {}", normalized, resolver, ex.getMessage());
            }
        }
        return addresses;
    }

    private Set<String> lookupARecords(String hostname, String resolver, int cnameDepth) throws Exception {
        if (cnameDepth > 4) {
            return Set.of();
        }

        byte[] query = buildQuery(hostname);
        byte[] response = exchange(query, resolver);
        ParsedResponse parsed = parseResponse(response, hostname);
        if (!parsed.aRecords().isEmpty()) {
            return parsed.aRecords();
        }

        Set<String> fromCname = new LinkedHashSet<>();
        for (String cname : parsed.cnames()) {
            fromCname.addAll(lookupARecords(cname, resolver, cnameDepth + 1));
        }
        return fromCname;
    }

    private byte[] exchange(byte[] query, String resolver) throws Exception {
        InetAddress address = InetAddress.getByName(resolver);
        int timeoutMs = Math.max(200, deploymentProperties.getDnsTimeoutMs());
        try (DatagramSocket socket = new DatagramSocket()) {
            socket.setSoTimeout(timeoutMs);
            DatagramPacket request = new DatagramPacket(query, query.length, address, DNS_PORT);
            socket.send(request);
            byte[] buffer = new byte[512];
            DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
            socket.receive(packet);
            byte[] response = new byte[packet.getLength()];
            System.arraycopy(packet.getData(), packet.getOffset(), response, 0, packet.getLength());
            return response;
        }
    }

    private static byte[] buildQuery(String hostname) {
        String[] labels = hostname.split("\\.");
        int length = 12;
        for (String label : labels) {
            length += 1 + label.length();
        }
        length += 5; // terminating zero + type + class

        ByteBuffer buffer = ByteBuffer.allocate(length);
        buffer.putShort((short) ThreadLocalRandom.current().nextInt(1, 0xFFFF));
        buffer.putShort((short) 0x0100); // recursion desired
        buffer.putShort((short) 1); // questions
        buffer.putShort((short) 0);
        buffer.putShort((short) 0);
        buffer.putShort((short) 0);
        for (String label : labels) {
            byte[] bytes = label.getBytes(StandardCharsets.US_ASCII);
            buffer.put((byte) bytes.length);
            buffer.put(bytes);
        }
        buffer.put((byte) 0);
        buffer.putShort((short) TYPE_A);
        buffer.putShort((short) CLASS_IN);
        return buffer.array();
    }

    private static ParsedResponse parseResponse(byte[] response, String hostname) {
        if (response.length < 12) {
            return ParsedResponse.empty();
        }

        int rcode = response[3] & 0x0F;
        if (rcode != 0) {
            return ParsedResponse.empty();
        }

        ByteBuffer buffer = ByteBuffer.wrap(response);
        buffer.position(4);
        int questions = Short.toUnsignedInt(buffer.getShort());
        int answers = Short.toUnsignedInt(buffer.getShort());
        buffer.getShort(); // authority
        buffer.getShort(); // additional
        for (int i = 0; i < questions; i++) {
            skipName(buffer);
            if (buffer.remaining() < 4) {
                return ParsedResponse.empty();
            }
            buffer.getShort();
            buffer.getShort();
        }

        Set<String> aRecords = new LinkedHashSet<>();
        Set<String> cnames = new LinkedHashSet<>();
        for (int i = 0; i < answers && buffer.remaining() >= 10; i++) {
            skipName(buffer);
            if (buffer.remaining() < 10) {
                break;
            }
            int type = Short.toUnsignedInt(buffer.getShort());
            buffer.getShort(); // class
            buffer.getInt(); // ttl
            int rdLength = Short.toUnsignedInt(buffer.getShort());
            if (buffer.remaining() < rdLength) {
                break;
            }
            int rdataStart = buffer.position();
            if (type == TYPE_A && rdLength == 4) {
                aRecords.add((buffer.get() & 0xFF) + "."
                        + (buffer.get() & 0xFF) + "."
                        + (buffer.get() & 0xFF) + "."
                        + (buffer.get() & 0xFF));
            } else if (type == TYPE_CNAME) {
                String cname = readName(buffer, rdataStart);
                if (!cname.isEmpty() && !cname.equals(hostname)) {
                    cnames.add(cname);
                }
                buffer.position(rdataStart + rdLength);
            } else {
                buffer.position(rdataStart + rdLength);
            }
        }
        return new ParsedResponse(aRecords, cnames);
    }

    private static void skipName(ByteBuffer buffer) {
        readName(buffer, buffer.position());
    }

    private static String readName(ByteBuffer buffer, int offset) {
        StringBuilder name = new StringBuilder();
        int jumped = 0;
        int position = offset;
        int hops = 0;
        while (hops++ < 20 && position < buffer.limit()) {
            int length = buffer.get(position) & 0xFF;
            if (length == 0) {
                if (jumped == 0) {
                    buffer.position(position + 1);
                }
                break;
            }
            if ((length & 0xC0) == 0xC0) {
                int pointer = ((length & 0x3F) << 8) | (buffer.get(position + 1) & 0xFF);
                if (jumped == 0) {
                    buffer.position(position + 2);
                    jumped = 1;
                }
                position = pointer;
                continue;
            }
            position++;
            if (position + length > buffer.limit()) {
                break;
            }
            if (name.length() > 0) {
                name.append('.');
            }
            byte[] label = new byte[length];
            for (int i = 0; i < length; i++) {
                label[i] = buffer.get(position++);
            }
            name.append(new String(label, StandardCharsets.US_ASCII));
            if (jumped == 0) {
                buffer.position(position);
            }
        }
        return name.toString().toLowerCase(Locale.ROOT);
    }

    private record ParsedResponse(Set<String> aRecords, Set<String> cnames) {
        static ParsedResponse empty() {
            return new ParsedResponse(Set.of(), Set.of());
        }
    }

}
