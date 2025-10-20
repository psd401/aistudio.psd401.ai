/**
 * SDK Version Detection System
 *
 * Detects the installed Vercel AI SDK version to enable compatibility layers
 * and version-specific behavior. This helps prevent breaking changes when
 * upgrading dependencies.
 *
 * @see https://github.com/psd401/aistudio.psd401.ai/issues/366
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger({ module: 'sdk-version-detector' });

export interface SDKVersionInfo {
  /** Full semver version string (e.g., "5.0.0") */
  version: string;
  /** Major version number */
  major: number;
  /** Minor version number */
  minor: number;
  /** Patch version number */
  patch: number;
  /** Prerelease identifier (e.g., "beta.1") if present */
  prerelease?: string;
  /** Method used to detect the version */
  detected: 'runtime' | 'package' | 'fallback';
}

/**
 * SDK Version Detector
 *
 * Detects the installed AI SDK version using multiple strategies:
 * 1. Runtime detection via module exports (fastest)
 * 2. Reading package.json from node_modules (reliable)
 * 3. Fallback to known version (last resort)
 *
 * The detected version is cached for the lifetime of the process.
 */
export class SDKVersionDetector {
  private static instance: SDKVersionInfo | null = null;

  /**
   * Detect the installed AI SDK version
   *
   * @returns Version information including major, minor, patch, and detection method
   *
   * @example
   * ```typescript
   * const version = SDKVersionDetector.detect();
   * console.log(`Using AI SDK v${version.version}`);
   * if (version.detected === 'fallback') {
   *   console.warn('Could not detect SDK version, using fallback');
   * }
   * ```
   */
  static detect(): SDKVersionInfo {
    if (this.instance) {
      return this.instance;
    }

    // Method 1: Try runtime detection
    try {
      // Some packages export their version
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const aiModule = require('ai');
      if (aiModule.VERSION && typeof aiModule.VERSION === 'string') {
        this.instance = this.parseVersion(aiModule.VERSION, 'runtime');
        log.debug('Detected SDK version via runtime', { version: this.instance });
        return this.instance;
      }
    } catch (error) {
      log.debug('Runtime detection failed', { error });
      // Continue to next method
    }

    // Method 2: Read from package.json
    try {
      const packagePath = join(process.cwd(), 'node_modules/ai/package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string };

      if (packageJson.version) {
        this.instance = this.parseVersion(packageJson.version, 'package');
        log.debug('Detected SDK version via package.json', { version: this.instance });
        return this.instance;
      }
    } catch (error) {
      log.debug('Package.json detection failed', { error });
      // Continue to fallback
    }

    // Method 3: Fallback to known version from package.json
    try {
      const rootPackagePath = join(process.cwd(), 'package.json');
      const rootPackage = JSON.parse(readFileSync(rootPackagePath, 'utf8')) as {
        dependencies?: { ai?: string };
        devDependencies?: { ai?: string };
      };

      const aiVersion = rootPackage.dependencies?.ai || rootPackage.devDependencies?.ai;

      if (aiVersion) {
        // Remove version range specifiers (^, ~, >=, etc.)
        const cleanVersion = aiVersion.replace(/^[\^~>=<]+/, '');
        this.instance = this.parseVersion(cleanVersion, 'fallback');
        log.warn('Using fallback SDK version detection', { version: this.instance });
        return this.instance;
      }
    } catch (error) {
      log.error('All version detection methods failed', { error });
    }

    // Absolute fallback - use v5.0.0 (current version at time of implementation)
    this.instance = this.parseVersion('5.0.0', 'fallback');
    log.warn('Unable to detect AI SDK version, using hardcoded fallback', {
      version: this.instance,
    });
    return this.instance;
  }

  /**
   * Parse a semver version string into structured components
   *
   * @param version - Semver version string (e.g., "5.0.0" or "5.1.0-beta.1")
   * @param source - Detection method used
   * @returns Parsed version information
   * @throws Error if version format is invalid
   */
  private static parseVersion(
    version: string,
    source: SDKVersionInfo['detected']
  ): SDKVersionInfo {
    // Match semver format: major.minor.patch[-prerelease]
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);

    if (!match) {
      throw new Error(`Invalid version format: ${version}`);
    }

    return {
      version,
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      prerelease: match[4],
      detected: source,
    };
  }

  /**
   * Check if the installed SDK version is compatible with requirements
   *
   * @param requiredMajor - Required major version
   * @param requiredMinor - Optional minimum minor version
   * @returns True if the installed version meets requirements
   *
   * @example
   * ```typescript
   * // Check if we have at least v5.x
   * if (SDKVersionDetector.isCompatible(5)) {
   *   // Use v5 features
   * }
   *
   * // Check if we have at least v5.2.x
   * if (SDKVersionDetector.isCompatible(5, 2)) {
   *   // Use v5.2+ features
   * }
   * ```
   */
  static isCompatible(requiredMajor: number, requiredMinor?: number): boolean {
    const info = this.detect();

    if (info.major !== requiredMajor) {
      return false;
    }

    if (requiredMinor !== undefined && info.minor < requiredMinor) {
      return false;
    }

    return true;
  }

  /**
   * Reset the cached version (useful for testing)
   * @internal
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Get version string for logging/telemetry
   *
   * @returns Human-readable version string
   *
   * @example
   * ```typescript
   * console.log(`AI SDK ${SDKVersionDetector.getVersionString()}`);
   * // Output: "AI SDK v5.0.0 (detected via package.json)"
   * ```
   */
  static getVersionString(): string {
    const info = this.detect();
    return `v${info.version} (detected via ${info.detected})`;
  }
}
