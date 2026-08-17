package auth

import (
	"bufio"
	"os"
	"strings"
)

// LoadEnv reads a .env file and sets environment variables if they are not already set in the environment.
func LoadEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return // Ignore error if .env file does not exist
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		line = strings.TrimPrefix(line, "export ")
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			val := strings.TrimSpace(parts[1])
			val = strings.Trim(val, `"'`) // Remove surrounding quotes if present

			if key != "" && os.Getenv(key) == "" {
				_ = os.Setenv(key, val)
			}
		}
	}
}
