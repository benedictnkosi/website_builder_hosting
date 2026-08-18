package com.webhosting.deploymentagent.util;

import java.nio.file.Path;

import com.webhosting.deploymentagent.exception.InvalidFilePathException;

public final class FilePathValidator {

    private FilePathValidator() {
    }

    public static void validateRelativePath(String filePath) {
        if (filePath == null || filePath.isBlank()) {
            throw new InvalidFilePathException("File path must not be blank");
        }

        String normalized = filePath.replace('\\', '/').trim();

        if (normalized.startsWith("/")) {
            throw new InvalidFilePathException("Absolute paths are not allowed: " + filePath);
        }

        if (normalized.contains("..")) {
            throw new InvalidFilePathException("Path traversal is not allowed: " + filePath);
        }

        if (normalized.contains(":")) {
            throw new InvalidFilePathException("Windows-style paths are not allowed: " + filePath);
        }

        if (normalized.startsWith("~")) {
            throw new InvalidFilePathException("Home directory paths are not allowed: " + filePath);
        }
    }

    public static Path resolveSafePath(Path websiteRoot, String filePath) {
        validateRelativePath(filePath);

        Path root = websiteRoot.toAbsolutePath().normalize();
        Path target = root.resolve(filePath).normalize();

        if (!target.startsWith(root)) {
            throw new InvalidFilePathException("Invalid file path: " + filePath);
        }

        return target;
    }
}
