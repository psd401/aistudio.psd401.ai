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
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const assertions_1 = require("aws-cdk-lib/assertions");
const constructs_1 = require("../lib/constructs");
describe("OptimizedLambda", () => {
    let app;
    let stack;
    let config;
    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack");
        config = constructs_1.EnvironmentConfig.get("dev");
    });
    describe("Basic Configuration", () => {
        test("creates Lambda function with ARM64 architecture by default", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                FunctionName: "test-function",
                Handler: "index.handler",
                Runtime: "nodejs20.x",
                Architectures: ["arm64"],
            });
        });
        test("creates Lambda function with x86 when Graviton disabled", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                enableGraviton: false,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Architectures: ["x86_64"],
            });
        });
        test("creates log group with correct retention", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Logs::LogGroup", {
                LogGroupName: "/aws/lambda/test-function",
                RetentionInDays: config.monitoring.logRetention,
            });
        });
    });
    describe("Performance Profiles", () => {
        test("applies critical profile correctly", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "critical",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                MemorySize: 1536, // Critical profile default
                Timeout: 300, // 5 minutes
                ReservedConcurrentExecutions: 10,
                DeadLetterConfig: assertions_1.Match.objectLike({
                    TargetArn: assertions_1.Match.anyValue(),
                }),
            });
        });
        test("applies standard profile correctly", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "standard",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                MemorySize: config.compute.lambdaMemory,
                Timeout: config.compute.lambdaTimeout.toSeconds(),
                ReservedConcurrentExecutions: 5,
            });
        });
        test("applies batch profile correctly", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "batch",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                MemorySize: 3008, // Batch profile default
                Timeout: 900, // 15 minutes
                ReservedConcurrentExecutions: 2,
            });
        });
    });
    describe("PowerTuning Configuration", () => {
        test("uses PowerTuned memory size when provided", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                powerTuning: {
                    enabled: true,
                    tunedMemorySize: 1536,
                    tunedTimeout: cdk.Duration.minutes(3),
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                MemorySize: 1536,
                Timeout: 180,
            });
        });
        test("adds PowerTuned tag when tuning results applied", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                powerTuning: {
                    enabled: true,
                    tunedMemorySize: 1536,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "PowerTuned", Value: "true" },
                    { Key: "OptimizedMemory", Value: "1536" },
                ]),
            });
        });
    });
    describe("Concurrency Configuration", () => {
        test("sets reserved concurrency", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                concurrency: {
                    reserved: 20,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                ReservedConcurrentExecutions: 20,
            });
        });
        test("creates alias with provisioned concurrency for critical functions", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "critical",
                concurrency: {
                    provisioned: 5,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Alias", {
                Name: "live",
                ProvisionedConcurrencyConfig: {
                    ProvisionedConcurrentExecutions: 5,
                },
            });
        });
        test("does not create provisioned concurrency for non-critical functions", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "standard",
                concurrency: {
                    provisioned: 5, // This should be ignored for non-critical
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.resourceCountIs("AWS::Lambda::Alias", 0);
        });
    });
    describe("Observability", () => {
        test("enables X-Ray tracing when configured", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config: {
                    ...config,
                    monitoring: {
                        ...config.monitoring,
                        tracingEnabled: true,
                    },
                },
                enableXRay: true,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                TracingConfig: {
                    Mode: "Active",
                },
            });
            // Should also have X-Ray permissions
            template.hasResourceProperties("AWS::IAM::Policy", {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Action: assertions_1.Match.arrayWith([
                                "xray:PutTraceSegments",
                                "xray:PutTelemetryRecords",
                            ]),
                        }),
                    ]),
                },
            });
        });
        test("disables X-Ray tracing when not configured", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config: {
                    ...config,
                    monitoring: {
                        ...config.monitoring,
                        tracingEnabled: false,
                    },
                },
                enableXRay: false,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                TracingConfig: assertions_1.Match.absent(),
            });
        });
        test("enables Lambda Insights when specified", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                enableInsights: true,
            });
            const template = assertions_1.Template.fromStack(stack);
            // Lambda Insights is added as a layer
            template.hasResourceProperties("AWS::Lambda::Function", {
                Layers: assertions_1.Match.arrayWith([
                    assertions_1.Match.stringLikeRegexp("LambdaInsightsExtension"),
                ]),
            });
        });
        test("creates monitoring dashboard when insights enabled", () => {
            const optimizedLambda = new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config: {
                    ...config,
                    monitoring: {
                        ...config.monitoring,
                        detailedMetrics: true,
                    },
                },
                enableInsights: true,
            });
            expect(optimizedLambda.dashboard).toBeDefined();
        });
    });
    describe("Environment Variables", () => {
        test("sets performance environment variables for ARM64", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                enableGraviton: true,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        NODE_OPTIONS: "--enable-source-maps",
                        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
                        AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: "1",
                        UV_THREADPOOL_SIZE: "8",
                        MALLOC_ARENA_MAX: "2",
                    }),
                },
            });
        });
        test("merges custom environment variables", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                environment: {
                    CUSTOM_VAR: "custom-value",
                    BUCKET_NAME: "my-bucket",
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        CUSTOM_VAR: "custom-value",
                        BUCKET_NAME: "my-bucket",
                        NODE_OPTIONS: "--enable-source-maps", // Should also have default vars
                    }),
                },
            });
        });
    });
    describe("Cost Tracking Tags", () => {
        test("adds cost allocation tags", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "critical",
                powerTuning: {
                    enabled: true,
                    tunedMemorySize: 2048,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Architecture", Value: "ARM64" },
                    { Key: "PerformanceProfile", Value: "critical" },
                    { Key: "PowerTuned", Value: "true" },
                    { Key: "OptimizedMemory", Value: "2048" },
                    { Key: "Optimized", Value: "true" },
                    { Key: "ManagedBy", Value: "OptimizedLambda" },
                ]),
            });
        });
    });
    describe("Integration", () => {
        test("exposes underlying Lambda function", () => {
            const optimizedLambda = new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
            });
            expect(optimizedLambda.function).toBeInstanceOf(lambda.Function);
            expect(optimizedLambda.function.functionName).toBe("test-function");
        });
        test("exposes log group", () => {
            const optimizedLambda = new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
            });
            expect(optimizedLambda.logGroup).toBeDefined();
        });
        test("grantInvoke delegates to underlying function", () => {
            const optimizedLambda = new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
            });
            const role = new cdk.aws_iam.Role(stack, "TestRole", {
                assumedBy: new cdk.aws_iam.ServicePrincipal("lambda.amazonaws.com"),
            });
            optimizedLambda.grantInvoke(role);
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::IAM::Policy", {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Action: "lambda:InvokeFunction",
                            Resource: assertions_1.Match.objectLike({
                                "Fn::GetAtt": assertions_1.Match.arrayWith([
                                    assertions_1.Match.stringLikeRegexp(".*Function.*"),
                                ]),
                            }),
                        }),
                    ]),
                },
            });
        });
        test("addEnvironment adds variables to function", () => {
            const optimizedLambda = new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
            });
            optimizedLambda.addEnvironment("NEW_VAR", "new-value");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        NEW_VAR: "new-value",
                    }),
                },
            });
        });
    });
    describe("Custom Runtime and Bundling", () => {
        test("supports custom runtime", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                runtime: lambda.Runtime.PYTHON_3_11,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Runtime: "python3.11",
            });
        });
        test("disables optimized bundling when requested", () => {
            const optimizedLambda = new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                enableOptimizedBundling: false,
            });
            expect(optimizedLambda.function).toBeDefined();
            // Can't easily test bundling options in unit tests, but ensure function is created
        });
    });
    describe("Log Retention", () => {
        test("uses custom log retention when provided", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                logRetention: cdk.aws_logs.RetentionDays.TWO_WEEKS,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Logs::LogGroup", {
                RetentionInDays: 14,
            });
        });
        test("uses profile-based log retention for critical functions", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "critical",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Logs::LogGroup", {
                RetentionInDays: 30, // ONE_MONTH for critical
            });
        });
        test("uses profile-based log retention for batch functions", () => {
            new constructs_1.OptimizedLambda(stack, "TestLambda", {
                functionName: "test-function",
                handler: "index.handler",
                codePath: "test/fixtures/lambda",
                config,
                performanceProfile: "batch",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Logs::LogGroup", {
                RetentionInDays: 7, // ONE_WEEK for batch
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3B0aW1pemVkLWxhbWJkYS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsib3B0aW1pemVkLWxhbWJkYS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQWtDO0FBQ2xDLCtEQUFnRDtBQUNoRCx1REFBd0Q7QUFDeEQsa0RBRzBCO0FBRTFCLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxHQUFHLEVBQUU7SUFDL0IsSUFBSSxHQUFZLENBQUE7SUFDaEIsSUFBSSxLQUFnQixDQUFBO0lBQ3BCLElBQUksTUFBZ0QsQ0FBQTtJQUVwRCxVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFBO1FBQ25CLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFBO1FBQ3ZDLE1BQU0sR0FBRyw4QkFBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUE7SUFDdkMsQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO1FBQ25DLElBQUksQ0FBQyw0REFBNEQsRUFBRSxHQUFHLEVBQUU7WUFDdEUsSUFBSSw0QkFBZSxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUU7Z0JBQ3ZDLFlBQVksRUFBRSxlQUFlO2dCQUM3QixPQUFPLEVBQUUsZUFBZTtnQkFDeEIsUUFBUSxFQUFFLHNCQUFzQjtnQkFDaEMsTUFBTTthQUNQLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQzFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDdEQsWUFBWSxFQUFFLGVBQWU7Z0JBQzdCLE9BQU8sRUFBRSxlQUFlO2dCQUN4QixPQUFPLEVBQUUsWUFBWTtn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QUFFLFlBQVksRUFBRTtnQkFDdkMsWUFBWSxFQUFFLGVBQWU7Z0JBQzdCLE9BQU8sRUFBRSxlQUFlO2dCQUN4QixRQUFRLEVBQUUsc0JBQXNCO2dCQUNoQyxNQUFNO2dCQUNOLGtCQUFrQixFQUFFLFVBQVU7YUFDL0IsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDMUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHFCQUFxQixFQUFFO2dCQUNwRCxlQUFlLEVBQUUsRUFBRSxFQUFFLHlCQUF5QjthQUMvQyxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxzREFBc0QsRUFBRSxHQUFHLEVBQUU7WUFDaEUsSUFBSSw0QkFBZSxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUU7Z0JBQ3ZDLFlBQVksRUFBRSxlQUFlO2dCQUM3QixPQUFPLEVBQUUsZUFBZTtnQkFDeEIsUUFBUSxFQUFFLHNCQUFzQjtnQkFDaEMsTUFBTTtnQkFDTixrQkFBa0IsRUFBRSxPQUFPO2FBQzVCLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQzFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsRUFBRTtnQkFDcEQsZUFBZSxFQUFFLENBQUMsRUFBRSxxQkFBcUI7YUFDMUMsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtBQUNKLENBQUMsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIlxuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSBcImF3cy1jZGstbGliL2Fzc2VydGlvbnNcIlxuaW1wb3J0IHtcbiAgT3B0aW1pemVkTGFtYmRhLFxuICBFbnZpcm9ubWVudENvbmZpZyxcbn0gZnJvbSBcIi4uL2xpYi9jb25zdHJ1Y3RzXCJcblxuZGVzY3JpYmUoXCJPcHRpbWl6ZWRMYW1iZGFcIiwgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwXG4gIGxldCBzdGFjazogY2RrLlN0YWNrXG4gIGxldCBjb25maWc6IFJldHVyblR5cGU8dHlwZW9mIEVudmlyb25tZW50Q29uZmlnLmdldD5cblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpXG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIilcbiAgICBjb25maWcgPSBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIilcbiAgfSlcblxuICBkZXNjcmliZShcIkJhc2ljIENvbmZpZ3VyYXRpb25cIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJjcmVhdGVzIExhbWJkYSBmdW5jdGlvbiB3aXRoIEFSTTY0IGFyY2hpdGVjdHVyZSBieSBkZWZhdWx0XCIsICgpID0+IHtcbiAgICAgIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIEhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBSdW50aW1lOiBcIm5vZGVqczIwLnhcIixcbiAgICAgICAgQXJjaGl0ZWN0dXJlczogW1wiYXJtNjRcIl0sXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBMYW1iZGEgZnVuY3Rpb24gd2l0aCB4ODYgd2hlbiBHcmF2aXRvbiBkaXNhYmxlZFwiLCAoKSA9PiB7XG4gICAgICBuZXcgT3B0aW1pemVkTGFtYmRhKHN0YWNrLCBcIlRlc3RMYW1iZGFcIiwge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IFwidGVzdC1mdW5jdGlvblwiLFxuICAgICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgICAgY29kZVBhdGg6IFwidGVzdC9maXh0dXJlcy9sYW1iZGFcIixcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBlbmFibGVHcmF2aXRvbjogZmFsc2UsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEFyY2hpdGVjdHVyZXM6IFtcIng4Nl82NFwiXSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJjcmVhdGVzIGxvZyBncm91cCB3aXRoIGNvcnJlY3QgcmV0ZW50aW9uXCIsICgpID0+IHtcbiAgICAgIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TG9nczo6TG9nR3JvdXBcIiwge1xuICAgICAgICBMb2dHcm91cE5hbWU6IFwiL2F3cy9sYW1iZGEvdGVzdC1mdW5jdGlvblwiLFxuICAgICAgICBSZXRlbnRpb25JbkRheXM6IGNvbmZpZy5tb25pdG9yaW5nLmxvZ1JldGVudGlvbixcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIlBlcmZvcm1hbmNlIFByb2ZpbGVzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwiYXBwbGllcyBjcml0aWNhbCBwcm9maWxlIGNvcnJlY3RseVwiLCAoKSA9PiB7XG4gICAgICBuZXcgT3B0aW1pemVkTGFtYmRhKHN0YWNrLCBcIlRlc3RMYW1iZGFcIiwge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IFwidGVzdC1mdW5jdGlvblwiLFxuICAgICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgICAgY29kZVBhdGg6IFwidGVzdC9maXh0dXJlcy9sYW1iZGFcIixcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBwZXJmb3JtYW5jZVByb2ZpbGU6IFwiY3JpdGljYWxcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgTWVtb3J5U2l6ZTogMTUzNiwgLy8gQ3JpdGljYWwgcHJvZmlsZSBkZWZhdWx0XG4gICAgICAgIFRpbWVvdXQ6IDMwMCwgLy8gNSBtaW51dGVzXG4gICAgICAgIFJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDEwLFxuICAgICAgICBEZWFkTGV0dGVyQ29uZmlnOiBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBUYXJnZXRBcm46IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgIH0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImFwcGxpZXMgc3RhbmRhcmQgcHJvZmlsZSBjb3JyZWN0bHlcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcGVyZm9ybWFuY2VQcm9maWxlOiBcInN0YW5kYXJkXCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIE1lbW9yeVNpemU6IGNvbmZpZy5jb21wdXRlLmxhbWJkYU1lbW9yeSxcbiAgICAgICAgVGltZW91dDogY29uZmlnLmNvbXB1dGUubGFtYmRhVGltZW91dC50b1NlY29uZHMoKSxcbiAgICAgICAgUmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogNSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJhcHBsaWVzIGJhdGNoIHByb2ZpbGUgY29ycmVjdGx5XCIsICgpID0+IHtcbiAgICAgIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICAgIHBlcmZvcm1hbmNlUHJvZmlsZTogXCJiYXRjaFwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBNZW1vcnlTaXplOiAzMDA4LCAvLyBCYXRjaCBwcm9maWxlIGRlZmF1bHRcbiAgICAgICAgVGltZW91dDogOTAwLCAvLyAxNSBtaW51dGVzXG4gICAgICAgIFJlc2VydmVkQ29uY3VycmVudEV4ZWN1dGlvbnM6IDIsXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJQb3dlclR1bmluZyBDb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwidXNlcyBQb3dlclR1bmVkIG1lbW9yeSBzaXplIHdoZW4gcHJvdmlkZWRcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcG93ZXJUdW5pbmc6IHtcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIHR1bmVkTWVtb3J5U2l6ZTogMTUzNixcbiAgICAgICAgICB0dW5lZFRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDMpLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBNZW1vcnlTaXplOiAxNTM2LFxuICAgICAgICBUaW1lb3V0OiAxODAsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiYWRkcyBQb3dlclR1bmVkIHRhZyB3aGVuIHR1bmluZyByZXN1bHRzIGFwcGxpZWRcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcG93ZXJUdW5pbmc6IHtcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIHR1bmVkTWVtb3J5U2l6ZTogMTUzNixcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJQb3dlclR1bmVkXCIsIFZhbHVlOiBcInRydWVcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIk9wdGltaXplZE1lbW9yeVwiLCBWYWx1ZTogXCIxNTM2XCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJDb25jdXJyZW5jeSBDb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2V0cyByZXNlcnZlZCBjb25jdXJyZW5jeVwiLCAoKSA9PiB7XG4gICAgICBuZXcgT3B0aW1pemVkTGFtYmRhKHN0YWNrLCBcIlRlc3RMYW1iZGFcIiwge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IFwidGVzdC1mdW5jdGlvblwiLFxuICAgICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgICAgY29kZVBhdGg6IFwidGVzdC9maXh0dXJlcy9sYW1iZGFcIixcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBjb25jdXJyZW5jeToge1xuICAgICAgICAgIHJlc2VydmVkOiAyMCxcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgUmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogMjAsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBhbGlhcyB3aXRoIHByb3Zpc2lvbmVkIGNvbmN1cnJlbmN5IGZvciBjcml0aWNhbCBmdW5jdGlvbnNcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcGVyZm9ybWFuY2VQcm9maWxlOiBcImNyaXRpY2FsXCIsXG4gICAgICAgIGNvbmN1cnJlbmN5OiB7XG4gICAgICAgICAgcHJvdmlzaW9uZWQ6IDUsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpBbGlhc1wiLCB7XG4gICAgICAgIE5hbWU6IFwibGl2ZVwiLFxuICAgICAgICBQcm92aXNpb25lZENvbmN1cnJlbmN5Q29uZmlnOiB7XG4gICAgICAgICAgUHJvdmlzaW9uZWRDb25jdXJyZW50RXhlY3V0aW9uczogNSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJkb2VzIG5vdCBjcmVhdGUgcHJvdmlzaW9uZWQgY29uY3VycmVuY3kgZm9yIG5vbi1jcml0aWNhbCBmdW5jdGlvbnNcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcGVyZm9ybWFuY2VQcm9maWxlOiBcInN0YW5kYXJkXCIsXG4gICAgICAgIGNvbmN1cnJlbmN5OiB7XG4gICAgICAgICAgcHJvdmlzaW9uZWQ6IDUsIC8vIFRoaXMgc2hvdWxkIGJlIGlnbm9yZWQgZm9yIG5vbi1jcml0aWNhbFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoXCJBV1M6OkxhbWJkYTo6QWxpYXNcIiwgMClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiT2JzZXJ2YWJpbGl0eVwiLCAoKSA9PiB7XG4gICAgdGVzdChcImVuYWJsZXMgWC1SYXkgdHJhY2luZyB3aGVuIGNvbmZpZ3VyZWRcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZzoge1xuICAgICAgICAgIC4uLmNvbmZpZyxcbiAgICAgICAgICBtb25pdG9yaW5nOiB7XG4gICAgICAgICAgICAuLi5jb25maWcubW9uaXRvcmluZyxcbiAgICAgICAgICAgIHRyYWNpbmdFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIGVuYWJsZVhSYXk6IHRydWUsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIFRyYWNpbmdDb25maWc6IHtcbiAgICAgICAgICBNb2RlOiBcIkFjdGl2ZVwiLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgLy8gU2hvdWxkIGFsc28gaGF2ZSBYLVJheSBwZXJtaXNzaW9uc1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlBvbGljeVwiLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgICBcInhyYXk6UHV0VHJhY2VTZWdtZW50c1wiLFxuICAgICAgICAgICAgICAgIFwieHJheTpQdXRUZWxlbWV0cnlSZWNvcmRzXCIsXG4gICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgXSksXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiZGlzYWJsZXMgWC1SYXkgdHJhY2luZyB3aGVuIG5vdCBjb25maWd1cmVkXCIsICgpID0+IHtcbiAgICAgIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWc6IHtcbiAgICAgICAgICAuLi5jb25maWcsXG4gICAgICAgICAgbW9uaXRvcmluZzoge1xuICAgICAgICAgICAgLi4uY29uZmlnLm1vbml0b3JpbmcsXG4gICAgICAgICAgICB0cmFjaW5nRW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgZW5hYmxlWFJheTogZmFsc2UsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIFRyYWNpbmdDb25maWc6IE1hdGNoLmFic2VudCgpLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImVuYWJsZXMgTGFtYmRhIEluc2lnaHRzIHdoZW4gc3BlY2lmaWVkXCIsICgpID0+IHtcbiAgICAgIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICAgIGVuYWJsZUluc2lnaHRzOiB0cnVlLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICAvLyBMYW1iZGEgSW5zaWdodHMgaXMgYWRkZWQgYXMgYSBsYXllclxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgTGF5ZXJzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJMYW1iZGFJbnNpZ2h0c0V4dGVuc2lvblwiKSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBtb25pdG9yaW5nIGRhc2hib2FyZCB3aGVuIGluc2lnaHRzIGVuYWJsZWRcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW1pemVkTGFtYmRhID0gbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZzoge1xuICAgICAgICAgIC4uLmNvbmZpZyxcbiAgICAgICAgICBtb25pdG9yaW5nOiB7XG4gICAgICAgICAgICAuLi5jb25maWcubW9uaXRvcmluZyxcbiAgICAgICAgICAgIGRldGFpbGVkTWV0cmljczogdHJ1ZSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBlbmFibGVJbnNpZ2h0czogdHJ1ZSxcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChvcHRpbWl6ZWRMYW1iZGEuZGFzaGJvYXJkKS50b0JlRGVmaW5lZCgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkVudmlyb25tZW50IFZhcmlhYmxlc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNldHMgcGVyZm9ybWFuY2UgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBBUk02NFwiLCAoKSA9PiB7XG4gICAgICBuZXcgT3B0aW1pemVkTGFtYmRhKHN0YWNrLCBcIlRlc3RMYW1iZGFcIiwge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IFwidGVzdC1mdW5jdGlvblwiLFxuICAgICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgICAgY29kZVBhdGg6IFwidGVzdC9maXh0dXJlcy9sYW1iZGFcIixcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBlbmFibGVHcmF2aXRvbjogdHJ1ZSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTk9ERV9PUFRJT05TOiBcIi0tZW5hYmxlLXNvdXJjZS1tYXBzXCIsXG4gICAgICAgICAgICBBV1NfTk9ERUpTX0NPTk5FQ1RJT05fUkVVU0VfRU5BQkxFRDogXCIxXCIsXG4gICAgICAgICAgICBBV1NfU0RLX0pTX1NVUFBSRVNTX01BSU5URU5BTkNFX01PREVfTUVTU0FHRTogXCIxXCIsXG4gICAgICAgICAgICBVVl9USFJFQURQT09MX1NJWkU6IFwiOFwiLFxuICAgICAgICAgICAgTUFMTE9DX0FSRU5BX01BWDogXCIyXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwibWVyZ2VzIGN1c3RvbSBlbnZpcm9ubWVudCB2YXJpYWJsZXNcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBDVVNUT01fVkFSOiBcImN1c3RvbS12YWx1ZVwiLFxuICAgICAgICAgIEJVQ0tFVF9OQU1FOiBcIm15LWJ1Y2tldFwiLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBFbnZpcm9ubWVudDoge1xuICAgICAgICAgIFZhcmlhYmxlczogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBDVVNUT01fVkFSOiBcImN1c3RvbS12YWx1ZVwiLFxuICAgICAgICAgICAgQlVDS0VUX05BTUU6IFwibXktYnVja2V0XCIsXG4gICAgICAgICAgICBOT0RFX09QVElPTlM6IFwiLS1lbmFibGUtc291cmNlLW1hcHNcIiwgLy8gU2hvdWxkIGFsc28gaGF2ZSBkZWZhdWx0IHZhcnNcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkNvc3QgVHJhY2tpbmcgVGFnc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcImFkZHMgY29zdCBhbGxvY2F0aW9uIHRhZ3NcIiwgKCkgPT4ge1xuICAgICAgbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgcGVyZm9ybWFuY2VQcm9maWxlOiBcImNyaXRpY2FsXCIsXG4gICAgICAgIHBvd2VyVHVuaW5nOiB7XG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICB0dW5lZE1lbW9yeVNpemU6IDIwNDgsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiQXJjaGl0ZWN0dXJlXCIsIFZhbHVlOiBcIkFSTTY0XCIgfSxcbiAgICAgICAgICB7IEtleTogXCJQZXJmb3JtYW5jZVByb2ZpbGVcIiwgVmFsdWU6IFwiY3JpdGljYWxcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIlBvd2VyVHVuZWRcIiwgVmFsdWU6IFwidHJ1ZVwiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiT3B0aW1pemVkTWVtb3J5XCIsIFZhbHVlOiBcIjIwNDhcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIk9wdGltaXplZFwiLCBWYWx1ZTogXCJ0cnVlXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJNYW5hZ2VkQnlcIiwgVmFsdWU6IFwiT3B0aW1pemVkTGFtYmRhXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJJbnRlZ3JhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcImV4cG9zZXMgdW5kZXJseWluZyBMYW1iZGEgZnVuY3Rpb25cIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW1pemVkTGFtYmRhID0gbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChvcHRpbWl6ZWRMYW1iZGEuZnVuY3Rpb24pLnRvQmVJbnN0YW5jZU9mKGxhbWJkYS5GdW5jdGlvbilcbiAgICAgIGV4cGVjdChvcHRpbWl6ZWRMYW1iZGEuZnVuY3Rpb24uZnVuY3Rpb25OYW1lKS50b0JlKFwidGVzdC1mdW5jdGlvblwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiZXhwb3NlcyBsb2cgZ3JvdXBcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW1pemVkTGFtYmRhID0gbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChvcHRpbWl6ZWRMYW1iZGEubG9nR3JvdXApLnRvQmVEZWZpbmVkKClcbiAgICB9KVxuXG4gICAgdGVzdChcImdyYW50SW52b2tlIGRlbGVnYXRlcyB0byB1bmRlcmx5aW5nIGZ1bmN0aW9uXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IG9wdGltaXplZExhbWJkYSA9IG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCByb2xlID0gbmV3IGNkay5hd3NfaWFtLlJvbGUoc3RhY2ssIFwiVGVzdFJvbGVcIiwge1xuICAgICAgICBhc3N1bWVkQnk6IG5ldyBjZGsuYXdzX2lhbS5TZXJ2aWNlUHJpbmNpcGFsKFwibGFtYmRhLmFtYXpvbmF3cy5jb21cIiksXG4gICAgICB9KVxuXG4gICAgICBvcHRpbWl6ZWRMYW1iZGEuZ3JhbnRJbnZva2Uocm9sZSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OklBTTo6UG9saWN5XCIsIHtcbiAgICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgQWN0aW9uOiBcImxhbWJkYTpJbnZva2VGdW5jdGlvblwiLFxuICAgICAgICAgICAgICBSZXNvdXJjZTogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgICAgXCJGbjo6R2V0QXR0XCI6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgICAgICBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiLipGdW5jdGlvbi4qXCIpLFxuICAgICAgICAgICAgICAgIF0pLFxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImFkZEVudmlyb25tZW50IGFkZHMgdmFyaWFibGVzIHRvIGZ1bmN0aW9uXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IG9wdGltaXplZExhbWJkYSA9IG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICB9KVxuXG4gICAgICBvcHRpbWl6ZWRMYW1iZGEuYWRkRW52aXJvbm1lbnQoXCJORVdfVkFSXCIsIFwibmV3LXZhbHVlXCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTkVXX1ZBUjogXCJuZXctdmFsdWVcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkN1c3RvbSBSdW50aW1lIGFuZCBCdW5kbGluZ1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInN1cHBvcnRzIGN1c3RvbSBydW50aW1lXCIsICgpID0+IHtcbiAgICAgIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBSdW50aW1lOiBcInB5dGhvbjMuMTFcIixcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJkaXNhYmxlcyBvcHRpbWl6ZWQgYnVuZGxpbmcgd2hlbiByZXF1ZXN0ZWRcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW1pemVkTGFtYmRhID0gbmV3IE9wdGltaXplZExhbWJkYShzdGFjaywgXCJUZXN0TGFtYmRhXCIsIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lOiBcInRlc3QtZnVuY3Rpb25cIixcbiAgICAgICAgaGFuZGxlcjogXCJpbmRleC5oYW5kbGVyXCIsXG4gICAgICAgIGNvZGVQYXRoOiBcInRlc3QvZml4dHVyZXMvbGFtYmRhXCIsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgZW5hYmxlT3B0aW1pemVkQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KG9wdGltaXplZExhbWJkYS5mdW5jdGlvbikudG9CZURlZmluZWQoKVxuICAgICAgLy8gQ2FuJ3QgZWFzaWx5IHRlc3QgYnVuZGxpbmcgb3B0aW9ucyBpbiB1bml0IHRlc3RzLCBidXQgZW5zdXJlIGZ1bmN0aW9uIGlzIGNyZWF0ZWRcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiTG9nIFJldGVudGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInVzZXMgY3VzdG9tIGxvZyByZXRlbnRpb24gd2hlbiBwcm92aWRlZFwiLCAoKSA9PiB7XG4gICAgICBuZXcgT3B0aW1pemVkTGFtYmRhKHN0YWNrLCBcIlRlc3RMYW1iZGFcIiwge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IFwidGVzdC1mdW5jdGlvblwiLFxuICAgICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgICAgY29kZVBhdGg6IFwidGVzdC9maXh0dXJlcy9sYW1iZGFcIixcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBsb2dSZXRlbnRpb246IGNkay5hd3NfbG9ncy5SZXRlbnRpb25EYXlzLlRXT19XRUVLUyxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMb2dzOjpMb2dHcm91cFwiLCB7XG4gICAgICAgIFJldGVudGlvbkluRGF5czogMTQsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwidXNlcyBwcm9maWxlLWJhc2VkIGxvZyByZXRlbnRpb24gZm9yIGNyaXRpY2FsIGZ1bmN0aW9uc1wiLCAoKSA9PiB7XG4gICAgICBuZXcgT3B0aW1pemVkTGFtYmRhKHN0YWNrLCBcIlRlc3RMYW1iZGFcIiwge1xuICAgICAgICBmdW5jdGlvbk5hbWU6IFwidGVzdC1mdW5jdGlvblwiLFxuICAgICAgICBoYW5kbGVyOiBcImluZGV4LmhhbmRsZXJcIixcbiAgICAgICAgY29kZVBhdGg6IFwidGVzdC9maXh0dXJlcy9sYW1iZGFcIixcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBwZXJmb3JtYW5jZVByb2ZpbGU6IFwiY3JpdGljYWxcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMb2dzOjpMb2dHcm91cFwiLCB7XG4gICAgICAgIFJldGVudGlvbkluRGF5czogMzAsIC8vIE9ORV9NT05USCBmb3IgY3JpdGljYWxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJ1c2VzIHByb2ZpbGUtYmFzZWQgbG9nIHJldGVudGlvbiBmb3IgYmF0Y2ggZnVuY3Rpb25zXCIsICgpID0+IHtcbiAgICAgIG5ldyBPcHRpbWl6ZWRMYW1iZGEoc3RhY2ssIFwiVGVzdExhbWJkYVwiLCB7XG4gICAgICAgIGZ1bmN0aW9uTmFtZTogXCJ0ZXN0LWZ1bmN0aW9uXCIsXG4gICAgICAgIGhhbmRsZXI6IFwiaW5kZXguaGFuZGxlclwiLFxuICAgICAgICBjb2RlUGF0aDogXCJ0ZXN0L2ZpeHR1cmVzL2xhbWJkYVwiLFxuICAgICAgICBjb25maWcsXG4gICAgICAgIHBlcmZvcm1hbmNlUHJvZmlsZTogXCJiYXRjaFwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxvZ3M6OkxvZ0dyb3VwXCIsIHtcbiAgICAgICAgUmV0ZW50aW9uSW5EYXlzOiA3LCAvLyBPTkVfV0VFSyBmb3IgYmF0Y2hcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=