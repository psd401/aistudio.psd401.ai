"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const cdk = __importStar(require("aws-cdk-lib"));
const environment_config_1 = require("../../lib/constructs/config/environment-config");
describe("EnvironmentConfig", () => {
    describe("Development Environment", () => {
        test("should return cost-optimized configuration for dev", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.costOptimization).toBe(true);
            expect(config.database.minCapacity).toBe(0.5);
            expect(config.database.maxCapacity).toBe(2);
            expect(config.database.autoPause).toBe(true);
            expect(config.database.deletionProtection).toBe(false);
            expect(config.database.multiAz).toBe(false);
        });
        test("should have minimal compute configuration for dev", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.compute.lambdaMemory).toBe(1024);
            expect(config.compute.lambdaTimeout).toEqual(cdk.Duration.minutes(5));
            expect(config.compute.ecsDesiredCount).toBe(1);
            expect(config.compute.ecsFargateSpot).toBe(true);
            expect(config.compute.ecsAutoScaling).toBe(false);
        });
        test("should have minimal monitoring for dev", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.monitoring.detailedMetrics).toBe(false);
            expect(config.monitoring.alarmingEnabled).toBe(false);
            expect(config.monitoring.logRetention).toBe(cdk.aws_logs.RetentionDays.ONE_WEEK);
            expect(config.monitoring.tracingEnabled).toBe(false);
        });
        test("should have minimal network configuration for dev", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.network.maxAzs).toBe(2);
            expect(config.network.natGateways).toBe(1);
            expect(config.network.vpcEndpoints).toEqual(["s3", "secretsmanager"]);
        });
        test("should have short backup retention for dev", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.database.backupRetention).toEqual(cdk.Duration.days(1));
        });
    });
    describe("Production Environment", () => {
        test("should return reliability-optimized configuration for prod", () => {
            const config = environment_config_1.EnvironmentConfig.get("prod");
            expect(config.costOptimization).toBe(false);
            expect(config.database.minCapacity).toBe(2);
            expect(config.database.maxCapacity).toBe(8);
            expect(config.database.autoPause).toBe(false);
            expect(config.database.deletionProtection).toBe(true);
            expect(config.database.multiAz).toBe(true);
        });
        test("should have maximum compute configuration for prod", () => {
            const config = environment_config_1.EnvironmentConfig.get("prod");
            expect(config.compute.lambdaMemory).toBe(3008);
            expect(config.compute.lambdaTimeout).toEqual(cdk.Duration.minutes(15));
            expect(config.compute.ecsDesiredCount).toBe(2);
            expect(config.compute.ecsFargateSpot).toBe(false);
            expect(config.compute.ecsAutoScaling).toBe(true);
        });
        test("should have comprehensive monitoring for prod", () => {
            const config = environment_config_1.EnvironmentConfig.get("prod");
            expect(config.monitoring.detailedMetrics).toBe(true);
            expect(config.monitoring.alarmingEnabled).toBe(true);
            expect(config.monitoring.logRetention).toBe(cdk.aws_logs.RetentionDays.ONE_MONTH);
            expect(config.monitoring.tracingEnabled).toBe(true);
        });
        test("should have comprehensive network configuration for prod", () => {
            const config = environment_config_1.EnvironmentConfig.get("prod");
            expect(config.network.maxAzs).toBe(3);
            expect(config.network.natGateways).toBe(3);
            expect(config.network.vpcEndpoints).toEqual([
                "s3",
                "secretsmanager",
                "rds",
                "ecs",
                "ecr",
                "logs",
            ]);
        });
        test("should have longer backup retention for prod", () => {
            const config = environment_config_1.EnvironmentConfig.get("prod");
            expect(config.database.backupRetention).toEqual(cdk.Duration.days(7));
        });
    });
    describe("Staging Environment", () => {
        test("should return balanced configuration for staging", () => {
            const config = environment_config_1.EnvironmentConfig.get("staging");
            expect(config.costOptimization).toBe(false);
            expect(config.database.minCapacity).toBe(1);
            expect(config.database.maxCapacity).toBe(4);
            expect(config.database.autoPause).toBe(false);
            expect(config.database.deletionProtection).toBe(false);
            expect(config.database.multiAz).toBe(true);
        });
        test("should have moderate compute configuration for staging", () => {
            const config = environment_config_1.EnvironmentConfig.get("staging");
            expect(config.compute.lambdaMemory).toBe(2048);
            expect(config.compute.lambdaTimeout).toEqual(cdk.Duration.minutes(10));
            expect(config.compute.ecsDesiredCount).toBe(1);
            expect(config.compute.ecsFargateSpot).toBe(true);
            expect(config.compute.ecsAutoScaling).toBe(true);
        });
        test("should have comprehensive monitoring for staging", () => {
            const config = environment_config_1.EnvironmentConfig.get("staging");
            expect(config.monitoring.detailedMetrics).toBe(true);
            expect(config.monitoring.alarmingEnabled).toBe(true);
            expect(config.monitoring.logRetention).toBe(cdk.aws_logs.RetentionDays.TWO_WEEKS);
            expect(config.monitoring.tracingEnabled).toBe(true);
        });
        test("should have moderate network configuration for staging", () => {
            const config = environment_config_1.EnvironmentConfig.get("staging");
            expect(config.network.maxAzs).toBe(2);
            expect(config.network.natGateways).toBe(2);
            expect(config.network.vpcEndpoints).toEqual([
                "s3",
                "secretsmanager",
                "rds",
                "ecs",
            ]);
        });
        test("should have moderate backup retention for staging", () => {
            const config = environment_config_1.EnvironmentConfig.get("staging");
            expect(config.database.backupRetention).toEqual(cdk.Duration.days(3));
        });
    });
    describe("Error Handling", () => {
        test("should throw error for unknown environment", () => {
            expect(() => environment_config_1.EnvironmentConfig.get("unknown")).toThrow("No configuration found for environment: unknown");
        });
        test("should throw error for empty environment", () => {
            expect(() => environment_config_1.EnvironmentConfig.get("")).toThrow("No configuration found for environment: ");
        });
    });
    describe("Configuration Override", () => {
        beforeEach(() => {
            // Reset configuration before each test
            // Note: In a real scenario, you might want to restore the original config
        });
        test("should allow overriding specific configuration values", () => {
            environment_config_1.EnvironmentConfig.override("dev", {
                database: {
                    minCapacity: 1,
                    maxCapacity: 4,
                    autoPause: false,
                    backupRetention: cdk.Duration.days(7),
                    deletionProtection: true,
                    multiAz: true,
                },
            });
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.database.minCapacity).toBe(1);
            expect(config.database.maxCapacity).toBe(4);
            expect(config.database.autoPause).toBe(false);
        });
        test("should preserve non-overridden configuration values", () => {
            const originalConfig = environment_config_1.EnvironmentConfig.get("dev");
            const originalLambdaMemory = originalConfig.compute.lambdaMemory;
            environment_config_1.EnvironmentConfig.override("dev", {
                database: {
                    minCapacity: 1,
                    maxCapacity: 4,
                    autoPause: false,
                    backupRetention: cdk.Duration.days(7),
                    deletionProtection: true,
                    multiAz: true,
                },
            });
            const config = environment_config_1.EnvironmentConfig.get("dev");
            // Database config should be overridden
            expect(config.database.minCapacity).toBe(1);
            // Other configs should remain unchanged
            expect(config.compute.lambdaMemory).toBe(originalLambdaMemory);
            expect(config.monitoring.detailedMetrics).toBe(false);
            expect(config.network.natGateways).toBe(1);
        });
        test("should allow partial override of nested configuration", () => {
            environment_config_1.EnvironmentConfig.override("dev", {
                compute: {
                    lambdaMemory: 2048,
                    lambdaTimeout: cdk.Duration.minutes(10),
                    ecsDesiredCount: 2,
                    ecsFargateSpot: false,
                    ecsAutoScaling: true,
                },
            });
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.compute.lambdaMemory).toBe(2048);
            expect(config.compute.lambdaTimeout).toEqual(cdk.Duration.minutes(10));
            // Database config should remain unchanged
            expect(config.database.minCapacity).toBe(0.5);
        });
    });
    describe("Type Safety", () => {
        test("should have all required database configuration fields", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.database).toHaveProperty("minCapacity");
            expect(config.database).toHaveProperty("maxCapacity");
            expect(config.database).toHaveProperty("autoPause");
            expect(config.database).toHaveProperty("backupRetention");
            expect(config.database).toHaveProperty("deletionProtection");
            expect(config.database).toHaveProperty("multiAz");
        });
        test("should have all required compute configuration fields", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.compute).toHaveProperty("lambdaMemory");
            expect(config.compute).toHaveProperty("lambdaTimeout");
            expect(config.compute).toHaveProperty("ecsDesiredCount");
            expect(config.compute).toHaveProperty("ecsFargateSpot");
            expect(config.compute).toHaveProperty("ecsAutoScaling");
        });
        test("should have all required monitoring configuration fields", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.monitoring).toHaveProperty("detailedMetrics");
            expect(config.monitoring).toHaveProperty("alarmingEnabled");
            expect(config.monitoring).toHaveProperty("logRetention");
            expect(config.monitoring).toHaveProperty("tracingEnabled");
        });
        test("should have all required network configuration fields", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config.network).toHaveProperty("maxAzs");
            expect(config.network).toHaveProperty("natGateways");
            expect(config.network).toHaveProperty("vpcEndpoints");
        });
        test("should have costOptimization field", () => {
            const config = environment_config_1.EnvironmentConfig.get("dev");
            expect(config).toHaveProperty("costOptimization");
            expect(typeof config.costOptimization).toBe("boolean");
        });
    });
    describe("Configuration Consistency", () => {
        test("dev should be more cost-optimized than prod", () => {
            const devConfig = environment_config_1.EnvironmentConfig.get("dev");
            const prodConfig = environment_config_1.EnvironmentConfig.get("prod");
            expect(devConfig.database.minCapacity).toBeLessThan(prodConfig.database.minCapacity);
            expect(devConfig.compute.lambdaMemory).toBeLessThan(prodConfig.compute.lambdaMemory);
            expect(devConfig.network.natGateways).toBeLessThan(prodConfig.network.natGateways);
        });
        test("prod should have better reliability than dev", () => {
            const devConfig = environment_config_1.EnvironmentConfig.get("dev");
            const prodConfig = environment_config_1.EnvironmentConfig.get("prod");
            expect(prodConfig.database.multiAz).toBe(true);
            expect(devConfig.database.multiAz).toBe(false);
            expect(prodConfig.database.deletionProtection).toBe(true);
            expect(devConfig.database.deletionProtection).toBe(false);
            expect(prodConfig.monitoring.detailedMetrics).toBe(true);
            expect(devConfig.monitoring.detailedMetrics).toBe(false);
        });
        test("staging should be between dev and prod", () => {
            const devConfig = environment_config_1.EnvironmentConfig.get("dev");
            const stagingConfig = environment_config_1.EnvironmentConfig.get("staging");
            const prodConfig = environment_config_1.EnvironmentConfig.get("prod");
            expect(stagingConfig.database.minCapacity).toBeGreaterThan(devConfig.database.minCapacity);
            expect(stagingConfig.database.minCapacity).toBeLessThan(prodConfig.database.minCapacity);
            expect(stagingConfig.compute.lambdaMemory).toBeGreaterThan(devConfig.compute.lambdaMemory);
            expect(stagingConfig.compute.lambdaMemory).toBeLessThan(prodConfig.compute.lambdaMemory);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW52aXJvbm1lbnQtY29uZmlnLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJlbnZpcm9ubWVudC1jb25maWcudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFrQztBQUNsQyx1RkFBa0Y7QUFFbEYsUUFBUSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtJQUNqQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsR0FBRyxFQUFFO1FBQ3ZDLElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDOUQsTUFBTSxNQUFNLEdBQUcsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTNDLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDMUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQzdDLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUMzQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDNUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDdEQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQzdDLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtZQUM3RCxNQUFNLE1BQU0sR0FBRyxzQ0FBaUIsQ0FB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QyxNQUFNLGFBQWEsR0FBRyxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUE7WUFDdEQsTUFBTSxVQUFVLEdBQUcsc0NBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWhELE1BQU0sQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFBO1lBQzFGLE1BQU0sQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFBO1lBRXhGLE1BQU0sQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLGVBQWUsQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFBO1lBQzFGLE1BQU0sQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFBO1FBQzFGLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7QUFDSixDQUFDLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIlxuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tIFwiLi4vLi4vbGliL2NvbnN0cnVjdHMvY29uZmlnL2Vudmlyb25tZW50LWNvbmZpZ1wiXG5cbmRlc2NyaWJlKFwiRW52aXJvbm1lbnRDb25maWdcIiwgKCkgPT4ge1xuICBkZXNjcmliZShcIkRldmVsb3BtZW50IEVudmlyb25tZW50XCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIHJldHVybiBjb3N0LW9wdGltaXplZCBjb25maWd1cmF0aW9uIGZvciBkZXZcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcuY29zdE9wdGltaXphdGlvbikudG9CZSh0cnVlKVxuICAgICAgZXhwZWN0KGNvbmZpZy5kYXRhYmFzZS5taW5DYXBhY2l0eSkudG9CZSgwLjUpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm1heENhcGFjaXR5KS50b0JlKDIpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLmF1dG9QYXVzZSkudG9CZSh0cnVlKVxuICAgICAgZXhwZWN0KGNvbmZpZy5kYXRhYmFzZS5kZWxldGlvblByb3RlY3Rpb24pLnRvQmUoZmFsc2UpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm11bHRpQXopLnRvQmUoZmFsc2UpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgaGF2ZSBtaW5pbWFsIGNvbXB1dGUgY29uZmlndXJhdGlvbiBmb3IgZGV2XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLmNvbXB1dGUubGFtYmRhTWVtb3J5KS50b0JlKDEwMjQpXG4gICAgICBleHBlY3QoY29uZmlnLmNvbXB1dGUubGFtYmRhVGltZW91dCkudG9FcXVhbChjZGsuRHVyYXRpb24ubWludXRlcyg1KSlcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5lY3NEZXNpcmVkQ291bnQpLnRvQmUoMSlcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5lY3NGYXJnYXRlU3BvdCkudG9CZSh0cnVlKVxuICAgICAgZXhwZWN0KGNvbmZpZy5jb21wdXRlLmVjc0F1dG9TY2FsaW5nKS50b0JlKGZhbHNlKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgbWluaW1hbCBtb25pdG9yaW5nIGZvciBkZXZcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1ldHJpY3MpLnRvQmUoZmFsc2UpXG4gICAgICBleHBlY3QoY29uZmlnLm1vbml0b3JpbmcuYWxhcm1pbmdFbmFibGVkKS50b0JlKGZhbHNlKVxuICAgICAgZXhwZWN0KGNvbmZpZy5tb25pdG9yaW5nLmxvZ1JldGVudGlvbikudG9CZShjZGsuYXdzX2xvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSylcbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZy50cmFjaW5nRW5hYmxlZCkudG9CZShmYWxzZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBoYXZlIG1pbmltYWwgbmV0d29yayBjb25maWd1cmF0aW9uIGZvciBkZXZcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcubmV0d29yay5tYXhBenMpLnRvQmUoMilcbiAgICAgIGV4cGVjdChjb25maWcubmV0d29yay5uYXRHYXRld2F5cykudG9CZSgxKVxuICAgICAgZXhwZWN0KGNvbmZpZy5uZXR3b3JrLnZwY0VuZHBvaW50cykudG9FcXVhbChbXCJzM1wiLCBcInNlY3JldHNtYW5hZ2VyXCJdKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgc2hvcnQgYmFja3VwIHJldGVudGlvbiBmb3IgZGV2XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLmJhY2t1cFJldGVudGlvbikudG9FcXVhbChjZGsuRHVyYXRpb24uZGF5cygxKSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiUHJvZHVjdGlvbiBFbnZpcm9ubWVudFwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCByZXR1cm4gcmVsaWFiaWxpdHktb3B0aW1pemVkIGNvbmZpZ3VyYXRpb24gZm9yIHByb2RcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwicHJvZFwiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLmNvc3RPcHRpbWl6YXRpb24pLnRvQmUoZmFsc2UpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm1pbkNhcGFjaXR5KS50b0JlKDIpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm1heENhcGFjaXR5KS50b0JlKDgpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLmF1dG9QYXVzZSkudG9CZShmYWxzZSlcbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UuZGVsZXRpb25Qcm90ZWN0aW9uKS50b0JlKHRydWUpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm11bHRpQXopLnRvQmUodHJ1ZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBoYXZlIG1heGltdW0gY29tcHV0ZSBjb25maWd1cmF0aW9uIGZvciBwcm9kXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IEVudmlyb25tZW50Q29uZmlnLmdldChcInByb2RcIilcblxuICAgICAgZXhwZWN0KGNvbmZpZy5jb21wdXRlLmxhbWJkYU1lbW9yeSkudG9CZSgzMDA4KVxuICAgICAgZXhwZWN0KGNvbmZpZy5jb21wdXRlLmxhbWJkYVRpbWVvdXQpLnRvRXF1YWwoY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpKVxuICAgICAgZXhwZWN0KGNvbmZpZy5jb21wdXRlLmVjc0Rlc2lyZWRDb3VudCkudG9CZSgyKVxuICAgICAgZXhwZWN0KGNvbmZpZy5jb21wdXRlLmVjc0ZhcmdhdGVTcG90KS50b0JlKGZhbHNlKVxuICAgICAgZXhwZWN0KGNvbmZpZy5jb21wdXRlLmVjc0F1dG9TY2FsaW5nKS50b0JlKHRydWUpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgaGF2ZSBjb21wcmVoZW5zaXZlIG1vbml0b3JpbmcgZm9yIHByb2RcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwicHJvZFwiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNZXRyaWNzKS50b0JlKHRydWUpXG4gICAgICBleHBlY3QoY29uZmlnLm1vbml0b3JpbmcuYWxhcm1pbmdFbmFibGVkKS50b0JlKHRydWUpXG4gICAgICBleHBlY3QoY29uZmlnLm1vbml0b3JpbmcubG9nUmV0ZW50aW9uKS50b0JlKGNkay5hd3NfbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USClcbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZy50cmFjaW5nRW5hYmxlZCkudG9CZSh0cnVlKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgY29tcHJlaGVuc2l2ZSBuZXR3b3JrIGNvbmZpZ3VyYXRpb24gZm9yIHByb2RcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwicHJvZFwiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLm5ldHdvcmsubWF4QXpzKS50b0JlKDMpXG4gICAgICBleHBlY3QoY29uZmlnLm5ldHdvcmsubmF0R2F0ZXdheXMpLnRvQmUoMylcbiAgICAgIGV4cGVjdChjb25maWcubmV0d29yay52cGNFbmRwb2ludHMpLnRvRXF1YWwoW1xuICAgICAgICBcInMzXCIsXG4gICAgICAgIFwic2VjcmV0c21hbmFnZXJcIixcbiAgICAgICAgXCJyZHNcIixcbiAgICAgICAgXCJlY3NcIixcbiAgICAgICAgXCJlY3JcIixcbiAgICAgICAgXCJsb2dzXCIsXG4gICAgICBdKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgbG9uZ2VyIGJhY2t1cCByZXRlbnRpb24gZm9yIHByb2RcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwicHJvZFwiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLmJhY2t1cFJldGVudGlvbikudG9FcXVhbChjZGsuRHVyYXRpb24uZGF5cyg3KSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiU3RhZ2luZyBFbnZpcm9ubWVudFwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCByZXR1cm4gYmFsYW5jZWQgY29uZmlndXJhdGlvbiBmb3Igc3RhZ2luZ1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJzdGFnaW5nXCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcuY29zdE9wdGltaXphdGlvbikudG9CZShmYWxzZSlcbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UubWluQ2FwYWNpdHkpLnRvQmUoMSlcbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UubWF4Q2FwYWNpdHkpLnRvQmUoNClcbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UuYXV0b1BhdXNlKS50b0JlKGZhbHNlKVxuICAgICAgZXhwZWN0KGNvbmZpZy5kYXRhYmFzZS5kZWxldGlvblByb3RlY3Rpb24pLnRvQmUoZmFsc2UpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm11bHRpQXopLnRvQmUodHJ1ZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBoYXZlIG1vZGVyYXRlIGNvbXB1dGUgY29uZmlndXJhdGlvbiBmb3Igc3RhZ2luZ1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJzdGFnaW5nXCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpLnRvQmUoMjA0OClcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5sYW1iZGFUaW1lb3V0KS50b0VxdWFsKGNkay5EdXJhdGlvbi5taW51dGVzKDEwKSlcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5lY3NEZXNpcmVkQ291bnQpLnRvQmUoMSlcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5lY3NGYXJnYXRlU3BvdCkudG9CZSh0cnVlKVxuICAgICAgZXhwZWN0KGNvbmZpZy5jb21wdXRlLmVjc0F1dG9TY2FsaW5nKS50b0JlKHRydWUpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgaGF2ZSBjb21wcmVoZW5zaXZlIG1vbml0b3JpbmcgZm9yIHN0YWdpbmdcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwic3RhZ2luZ1wiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLm1vbml0b3JpbmcuZGV0YWlsZWRNZXRyaWNzKS50b0JlKHRydWUpXG4gICAgICBleHBlY3QoY29uZmlnLm1vbml0b3JpbmcuYWxhcm1pbmdFbmFibGVkKS50b0JlKHRydWUpXG4gICAgICBleHBlY3QoY29uZmlnLm1vbml0b3JpbmcubG9nUmV0ZW50aW9uKS50b0JlKGNkay5hd3NfbG9ncy5SZXRlbnRpb25EYXlzLlRXT19XRUVLUylcbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZy50cmFjaW5nRW5hYmxlZCkudG9CZSh0cnVlKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgbW9kZXJhdGUgbmV0d29yayBjb25maWd1cmF0aW9uIGZvciBzdGFnaW5nXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZyA9IEVudmlyb25tZW50Q29uZmlnLmdldChcInN0YWdpbmdcIilcblxuICAgICAgZXhwZWN0KGNvbmZpZy5uZXR3b3JrLm1heEF6cykudG9CZSgyKVxuICAgICAgZXhwZWN0KGNvbmZpZy5uZXR3b3JrLm5hdEdhdGV3YXlzKS50b0JlKDIpXG4gICAgICBleHBlY3QoY29uZmlnLm5ldHdvcmsudnBjRW5kcG9pbnRzKS50b0VxdWFsKFtcbiAgICAgICAgXCJzM1wiLFxuICAgICAgICBcInNlY3JldHNtYW5hZ2VyXCIsXG4gICAgICAgIFwicmRzXCIsXG4gICAgICAgIFwiZWNzXCIsXG4gICAgICBdKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgbW9kZXJhdGUgYmFja3VwIHJldGVudGlvbiBmb3Igc3RhZ2luZ1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJzdGFnaW5nXCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UuYmFja3VwUmV0ZW50aW9uKS50b0VxdWFsKGNkay5EdXJhdGlvbi5kYXlzKDMpKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJFcnJvciBIYW5kbGluZ1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCB0aHJvdyBlcnJvciBmb3IgdW5rbm93biBlbnZpcm9ubWVudFwiLCAoKSA9PiB7XG4gICAgICBleHBlY3QoKCkgPT4gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwidW5rbm93blwiKSkudG9UaHJvdyhcbiAgICAgICAgXCJObyBjb25maWd1cmF0aW9uIGZvdW5kIGZvciBlbnZpcm9ubWVudDogdW5rbm93blwiXG4gICAgICApXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgdGhyb3cgZXJyb3IgZm9yIGVtcHR5IGVudmlyb25tZW50XCIsICgpID0+IHtcbiAgICAgIGV4cGVjdCgoKSA9PiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJcIikpLnRvVGhyb3coXG4gICAgICAgIFwiTm8gY29uZmlndXJhdGlvbiBmb3VuZCBmb3IgZW52aXJvbm1lbnQ6IFwiXG4gICAgICApXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkNvbmZpZ3VyYXRpb24gT3ZlcnJpZGVcIiwgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgLy8gUmVzZXQgY29uZmlndXJhdGlvbiBiZWZvcmUgZWFjaCB0ZXN0XG4gICAgICAvLyBOb3RlOiBJbiBhIHJlYWwgc2NlbmFyaW8sIHlvdSBtaWdodCB3YW50IHRvIHJlc3RvcmUgdGhlIG9yaWdpbmFsIGNvbmZpZ1xuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGFsbG93IG92ZXJyaWRpbmcgc3BlY2lmaWMgY29uZmlndXJhdGlvbiB2YWx1ZXNcIiwgKCkgPT4ge1xuICAgICAgRW52aXJvbm1lbnRDb25maWcub3ZlcnJpZGUoXCJkZXZcIiwge1xuICAgICAgICBkYXRhYmFzZToge1xuICAgICAgICAgIG1pbkNhcGFjaXR5OiAxLFxuICAgICAgICAgIG1heENhcGFjaXR5OiA0LFxuICAgICAgICAgIGF1dG9QYXVzZTogZmFsc2UsXG4gICAgICAgICAgYmFja3VwUmV0ZW50aW9uOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgICBkZWxldGlvblByb3RlY3Rpb246IHRydWUsXG4gICAgICAgICAgbXVsdGlBejogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IGNvbmZpZyA9IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKVxuXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm1pbkNhcGFjaXR5KS50b0JlKDEpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm1heENhcGFjaXR5KS50b0JlKDQpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLmF1dG9QYXVzZSkudG9CZShmYWxzZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBwcmVzZXJ2ZSBub24tb3ZlcnJpZGRlbiBjb25maWd1cmF0aW9uIHZhbHVlc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBvcmlnaW5hbENvbmZpZyA9IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKVxuICAgICAgY29uc3Qgb3JpZ2luYWxMYW1iZGFNZW1vcnkgPSBvcmlnaW5hbENvbmZpZy5jb21wdXRlLmxhbWJkYU1lbW9yeVxuXG4gICAgICBFbnZpcm9ubWVudENvbmZpZy5vdmVycmlkZShcImRldlwiLCB7XG4gICAgICAgIGRhdGFiYXNlOiB7XG4gICAgICAgICAgbWluQ2FwYWNpdHk6IDEsXG4gICAgICAgICAgbWF4Q2FwYWNpdHk6IDQsXG4gICAgICAgICAgYXV0b1BhdXNlOiBmYWxzZSxcbiAgICAgICAgICBiYWNrdXBSZXRlbnRpb246IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICAgIGRlbGV0aW9uUHJvdGVjdGlvbjogdHJ1ZSxcbiAgICAgICAgICBtdWx0aUF6OiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIC8vIERhdGFiYXNlIGNvbmZpZyBzaG91bGQgYmUgb3ZlcnJpZGRlblxuICAgICAgZXhwZWN0KGNvbmZpZy5kYXRhYmFzZS5taW5DYXBhY2l0eSkudG9CZSgxKVxuXG4gICAgICAvLyBPdGhlciBjb25maWdzIHNob3VsZCByZW1haW4gdW5jaGFuZ2VkXG4gICAgICBleHBlY3QoY29uZmlnLmNvbXB1dGUubGFtYmRhTWVtb3J5KS50b0JlKG9yaWdpbmFsTGFtYmRhTWVtb3J5KVxuICAgICAgZXhwZWN0KGNvbmZpZy5tb25pdG9yaW5nLmRldGFpbGVkTWV0cmljcykudG9CZShmYWxzZSlcbiAgICAgIGV4cGVjdChjb25maWcubmV0d29yay5uYXRHYXRld2F5cykudG9CZSgxKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGFsbG93IHBhcnRpYWwgb3ZlcnJpZGUgb2YgbmVzdGVkIGNvbmZpZ3VyYXRpb25cIiwgKCkgPT4ge1xuICAgICAgRW52aXJvbm1lbnRDb25maWcub3ZlcnJpZGUoXCJkZXZcIiwge1xuICAgICAgICBjb21wdXRlOiB7XG4gICAgICAgICAgbGFtYmRhTWVtb3J5OiAyMDQ4LFxuICAgICAgICAgIGxhbWJkYVRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEwKSxcbiAgICAgICAgICBlY3NEZXNpcmVkQ291bnQ6IDIsXG4gICAgICAgICAgZWNzRmFyZ2F0ZVNwb3Q6IGZhbHNlLFxuICAgICAgICAgIGVjc0F1dG9TY2FsaW5nOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpLnRvQmUoMjA0OClcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZS5sYW1iZGFUaW1lb3V0KS50b0VxdWFsKGNkay5EdXJhdGlvbi5taW51dGVzKDEwKSlcblxuICAgICAgLy8gRGF0YWJhc2UgY29uZmlnIHNob3VsZCByZW1haW4gdW5jaGFuZ2VkXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlLm1pbkNhcGFjaXR5KS50b0JlKDAuNSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiVHlwZSBTYWZldHlcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgaGF2ZSBhbGwgcmVxdWlyZWQgZGF0YWJhc2UgY29uZmlndXJhdGlvbiBmaWVsZHNcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UpLnRvSGF2ZVByb3BlcnR5KFwibWluQ2FwYWNpdHlcIilcbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UpLnRvSGF2ZVByb3BlcnR5KFwibWF4Q2FwYWNpdHlcIilcbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UpLnRvSGF2ZVByb3BlcnR5KFwiYXV0b1BhdXNlXCIpXG4gICAgICBleHBlY3QoY29uZmlnLmRhdGFiYXNlKS50b0hhdmVQcm9wZXJ0eShcImJhY2t1cFJldGVudGlvblwiKVxuICAgICAgZXhwZWN0KGNvbmZpZy5kYXRhYmFzZSkudG9IYXZlUHJvcGVydHkoXCJkZWxldGlvblByb3RlY3Rpb25cIilcbiAgICAgIGV4cGVjdChjb25maWcuZGF0YWJhc2UpLnRvSGF2ZVByb3BlcnR5KFwibXVsdGlBelwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgYWxsIHJlcXVpcmVkIGNvbXB1dGUgY29uZmlndXJhdGlvbiBmaWVsZHNcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZSkudG9IYXZlUHJvcGVydHkoXCJsYW1iZGFNZW1vcnlcIilcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZSkudG9IYXZlUHJvcGVydHkoXCJsYW1iZGFUaW1lb3V0XCIpXG4gICAgICBleHBlY3QoY29uZmlnLmNvbXB1dGUpLnRvSGF2ZVByb3BlcnR5KFwiZWNzRGVzaXJlZENvdW50XCIpXG4gICAgICBleHBlY3QoY29uZmlnLmNvbXB1dGUpLnRvSGF2ZVByb3BlcnR5KFwiZWNzRmFyZ2F0ZVNwb3RcIilcbiAgICAgIGV4cGVjdChjb25maWcuY29tcHV0ZSkudG9IYXZlUHJvcGVydHkoXCJlY3NBdXRvU2NhbGluZ1wiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgYWxsIHJlcXVpcmVkIG1vbml0b3JpbmcgY29uZmlndXJhdGlvbiBmaWVsZHNcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZykudG9IYXZlUHJvcGVydHkoXCJkZXRhaWxlZE1ldHJpY3NcIilcbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZykudG9IYXZlUHJvcGVydHkoXCJhbGFybWluZ0VuYWJsZWRcIilcbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZykudG9IYXZlUHJvcGVydHkoXCJsb2dSZXRlbnRpb25cIilcbiAgICAgIGV4cGVjdChjb25maWcubW9uaXRvcmluZykudG9IYXZlUHJvcGVydHkoXCJ0cmFjaW5nRW5hYmxlZFwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgYWxsIHJlcXVpcmVkIG5ldHdvcmsgY29uZmlndXJhdGlvbiBmaWVsZHNcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpXG5cbiAgICAgIGV4cGVjdChjb25maWcubmV0d29yaykudG9IYXZlUHJvcGVydHkoXCJtYXhBenNcIilcbiAgICAgIGV4cGVjdChjb25maWcubmV0d29yaykudG9IYXZlUHJvcGVydHkoXCJuYXRHYXRld2F5c1wiKVxuICAgICAgZXhwZWN0KGNvbmZpZy5uZXR3b3JrKS50b0hhdmVQcm9wZXJ0eShcInZwY0VuZHBvaW50c1wiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhdmUgY29zdE9wdGltaXphdGlvbiBmaWVsZFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIilcblxuICAgICAgZXhwZWN0KGNvbmZpZykudG9IYXZlUHJvcGVydHkoXCJjb3N0T3B0aW1pemF0aW9uXCIpXG4gICAgICBleHBlY3QodHlwZW9mIGNvbmZpZy5jb3N0T3B0aW1pemF0aW9uKS50b0JlKFwiYm9vbGVhblwiKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJDb25maWd1cmF0aW9uIENvbnNpc3RlbmN5XCIsICgpID0+IHtcbiAgICB0ZXN0KFwiZGV2IHNob3VsZCBiZSBtb3JlIGNvc3Qtb3B0aW1pemVkIHRoYW4gcHJvZFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBkZXZDb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIilcbiAgICAgIGNvbnN0IHByb2RDb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpXG5cbiAgICAgIGV4cGVjdChkZXZDb25maWcuZGF0YWJhc2UubWluQ2FwYWNpdHkpLnRvQmVMZXNzVGhhbihwcm9kQ29uZmlnLmRhdGFiYXNlLm1pbkNhcGFjaXR5KVxuICAgICAgZXhwZWN0KGRldkNvbmZpZy5jb21wdXRlLmxhbWJkYU1lbW9yeSkudG9CZUxlc3NUaGFuKHByb2RDb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpXG4gICAgICBleHBlY3QoZGV2Q29uZmlnLm5ldHdvcmsubmF0R2F0ZXdheXMpLnRvQmVMZXNzVGhhbihwcm9kQ29uZmlnLm5ldHdvcmsubmF0R2F0ZXdheXMpXG4gICAgfSlcblxuICAgIHRlc3QoXCJwcm9kIHNob3VsZCBoYXZlIGJldHRlciByZWxpYWJpbGl0eSB0aGFuIGRldlwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBkZXZDb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIilcbiAgICAgIGNvbnN0IHByb2RDb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpXG5cbiAgICAgIGV4cGVjdChwcm9kQ29uZmlnLmRhdGFiYXNlLm11bHRpQXopLnRvQmUodHJ1ZSlcbiAgICAgIGV4cGVjdChkZXZDb25maWcuZGF0YWJhc2UubXVsdGlBeikudG9CZShmYWxzZSlcblxuICAgICAgZXhwZWN0KHByb2RDb25maWcuZGF0YWJhc2UuZGVsZXRpb25Qcm90ZWN0aW9uKS50b0JlKHRydWUpXG4gICAgICBleHBlY3QoZGV2Q29uZmlnLmRhdGFiYXNlLmRlbGV0aW9uUHJvdGVjdGlvbikudG9CZShmYWxzZSlcblxuICAgICAgZXhwZWN0KHByb2RDb25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1ldHJpY3MpLnRvQmUodHJ1ZSlcbiAgICAgIGV4cGVjdChkZXZDb25maWcubW9uaXRvcmluZy5kZXRhaWxlZE1ldHJpY3MpLnRvQmUoZmFsc2UpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzdGFnaW5nIHNob3VsZCBiZSBiZXR3ZWVuIGRldiBhbmQgcHJvZFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBkZXZDb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIilcbiAgICAgIGNvbnN0IHN0YWdpbmdDb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJzdGFnaW5nXCIpXG4gICAgICBjb25zdCBwcm9kQ29uZmlnID0gRW52aXJvbm1lbnRDb25maWcuZ2V0KFwicHJvZFwiKVxuXG4gICAgICBleHBlY3Qoc3RhZ2luZ0NvbmZpZy5kYXRhYmFzZS5taW5DYXBhY2l0eSkudG9CZUdyZWF0ZXJUaGFuKGRldkNvbmZpZy5kYXRhYmFzZS5taW5DYXBhY2l0eSlcbiAgICAgIGV4cGVjdChzdGFnaW5nQ29uZmlnLmRhdGFiYXNlLm1pbkNhcGFjaXR5KS50b0JlTGVzc1RoYW4ocHJvZENvbmZpZy5kYXRhYmFzZS5taW5DYXBhY2l0eSlcblxuICAgICAgZXhwZWN0KHN0YWdpbmdDb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpLnRvQmVHcmVhdGVyVGhhbihkZXZDb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpXG4gICAgICBleHBlY3Qoc3RhZ2luZ0NvbmZpZy5jb21wdXRlLmxhbWJkYU1lbW9yeSkudG9CZUxlc3NUaGFuKHByb2RDb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=