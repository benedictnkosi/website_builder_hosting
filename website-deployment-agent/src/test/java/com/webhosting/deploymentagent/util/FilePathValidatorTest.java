package com.webhosting.deploymentagent.util;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.webhosting.deploymentagent.exception.InvalidFilePathException;

class FilePathValidatorTest {

    @TempDir
    Path websiteRoot;

    @ParameterizedTest
    @ValueSource(strings = {
            "index.html",
            "css/style.css",
            "images/logo.svg"
    })
    void acceptsValidPaths(String filePath) {
        assertDoesNotThrow(() -> FilePathValidator.validateRelativePath(filePath));
        assertDoesNotThrow(() -> FilePathValidator.resolveSafePath(websiteRoot, filePath));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "../secret.txt",
            "../../etc/passwd",
            "/etc/passwd",
            "C:\\Windows\\something",
            "/var/www/something"
    })
    void rejectsDangerousPaths(String filePath) {
        assertThrows(InvalidFilePathException.class,
                () -> FilePathValidator.validateRelativePath(filePath));
    }

    @Test
    void resolvedPathStaysInsideWebsiteRoot() {
        Path resolved = FilePathValidator.resolveSafePath(websiteRoot, "css/main.css");
        assertEquals(websiteRoot.resolve("css/main.css").normalize(), resolved.normalize());
    }

    @Test
    void rejectsPathTraversalAfterNormalization() {
        assertThrows(InvalidFilePathException.class,
                () -> FilePathValidator.resolveSafePath(websiteRoot, "css/../../outside.txt"));
    }
}
