package com.webhosting.deploymentagent.util;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ProcessExecutor {

    private static final Logger log = LoggerFactory.getLogger(ProcessExecutor.class);

    public ProcessResult execute(List<String> command) throws IOException, InterruptedException {
        log.debug("Executing command: {}", command);

        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(false);

        Process process = processBuilder.start();

        String stdout = readStream(process.getInputStream());
        String stderr = readStream(process.getErrorStream());
        int exitCode = process.waitFor();

        ProcessResult result = new ProcessResult(exitCode, stdout, stderr);
        log.debug("Command finished with exit code {}", exitCode);
        return result;
    }

    private String readStream(java.io.InputStream inputStream) throws IOException {
        StringBuilder output = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!output.isEmpty()) {
                    output.append(System.lineSeparator());
                }
                output.append(line);
            }
        }
        return output.toString();
    }

    public static class ProcessResult {
        private final int exitCode;
        private final String stdout;
        private final String stderr;

        public ProcessResult(int exitCode, String stdout, String stderr) {
            this.exitCode = exitCode;
            this.stdout = stdout;
            this.stderr = stderr;
        }

        public int getExitCode() {
            return exitCode;
        }

        public String getStdout() {
            return stdout;
        }

        public String getStderr() {
            return stderr;
        }

        public boolean isSuccess() {
            return exitCode == 0;
        }

        public String combinedOutput() {
            List<String> parts = new ArrayList<>();
            if (stdout != null && !stdout.isBlank()) {
                parts.add(stdout.trim());
            }
            if (stderr != null && !stderr.isBlank()) {
                parts.add(stderr.trim());
            }
            return String.join(System.lineSeparator(), parts);
        }
    }
}
