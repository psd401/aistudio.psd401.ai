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
const assertions_1 = require("aws-cdk-lib/assertions");
const base_stack_1 = require("../../lib/constructs/base/base-stack");
const environment_config_1 = require("../../lib/constructs/config/environment-config");
// Test implementation of BaseStack
class TestStack extends base_stack_1.BaseStack {
    defineResources(props) {
        // Create a simple S3 bucket for testing
        new cdk.aws_s3.Bucket(this, "TestBucket", {
            removalPolicy: this.getRemovalPolicy(),
        });
        // Create an SSM parameter using helper
        this.createParameter("test-value", "test-123", "Test parameter");
    }
}
describe("BaseStack", () => {
    let app;
    // Standard test environment for CDK stacks
    const testEnv = {
        account: "123456789012",
        region: "us-east-1",
    };
    beforeEach(() => {
        app = new cdk.App();
    });
    describe("Stack Naming and Configuration", () => {
        test("should create stack with correct naming convention", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: {
                    account: "123456789012",
                    region: "us-east-1",
                },
            });
            expect(stack.stackName).toBe("AIStudio-TestStack-Dev-dev");
        });
        test("should use custom project name in stack name", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                projectName: "CustomProject",
                env: {
                    account: "123456789012",
                    region: "us-east-1",
                },
            });
            expect(stack.stackName).toBe("CustomProject-TestStack-Dev-dev");
        });
        test("should set description based on environment", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            expect(template.toJSON().Description).toBe("TestStack-Dev for dev environment");
        });
    });
    describe("Termination Protection", () => {
        test("should enable termination protection for prod", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                deploymentEnvironment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: testEnv,
            });
            expect(stack.terminationProtection).toBe(true);
        });
        test("should disable termination protection for dev", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            expect(stack.terminationProtection).toBe(false);
        });
        test("should disable termination protection for staging", () => {
            const stack = new TestStack(app, "TestStack-Staging", {
                deploymentEnvironment: "staging",
                config: environment_config_1.EnvironmentConfig.get("staging"),
                env: testEnv,
            });
            expect(stack.terminationProtection).toBe(false);
        });
    });
    describe("Automatic Tagging", () => {
        test("should apply all standard tags to resources", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            // Check that bucket has tags (TaggingAspect should apply them)
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([{ Key: "Environment", Value: "Dev" }]),
            });
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([{ Key: "Project", Value: "AIStudio" }]),
            });
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([{ Key: "Owner", Value: "TSD Engineering" }]),
            });
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([{ Key: "ManagedBy", Value: "CDK" }]),
            });
        });
        test("should capitalize environment in tags", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                deploymentEnvironment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Environment", Value: "Prod" },
                ]),
            });
        });
        test("should apply custom project name to tags", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                projectName: "CustomProject",
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Project", Value: "CustomProject" },
                ]),
            });
        });
        test("should apply custom owner to tags", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                owner: "Custom Team",
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Owner", Value: "Custom Team" },
                ]),
            });
        });
    });
    describe("Standard Outputs", () => {
        test("should create StackEnvironment output", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasOutput("StackEnvironment", {
                Value: "dev",
                Description: "Environment for this stack",
                Export: {
                    Name: "AIStudio-TestStack-Dev-dev-Environment",
                },
            });
        });
        test("should create StackVersion output", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasOutput("StackVersion", {
                Description: "CDK version used for deployment",
            });
        });
    });
    describe("Helper Methods", () => {
        test("getRemovalPolicy should return RETAIN for prod", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                deploymentEnvironment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: {
                    account: "123456789012",
                    region: "us-east-1",
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            // Bucket should have DeletionPolicy: Retain
            template.hasResource("AWS::S3::Bucket", {
                DeletionPolicy: "Retain",
            });
        });
        test("getRemovalPolicy should return DESTROY for dev", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: {
                    account: "123456789012",
                    region: "us-east-1",
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            // Bucket should have DeletionPolicy: Delete
            template.hasResource("AWS::S3::Bucket", {
                DeletionPolicy: "Delete",
            });
        });
        test("getEnvValue should return dev value for dev environment", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            // Access the protected method through a type assertion
            const result = stack.getEnvValue("dev-value", "prod-value");
            expect(result).toBe("dev-value");
        });
        test("getEnvValue should return prod value for prod environment", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                deploymentEnvironment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: testEnv,
            });
            const result = stack.getEnvValue("dev-value", "prod-value");
            expect(result).toBe("prod-value");
        });
        test("createParameter should create SSM parameter with correct naming", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: {
                    account: "123456789012",
                    region: "us-east-1",
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::SSM::Parameter", {
                Name: "/aistudio/dev/test-value",
                Value: "test-123",
                Description: "Test parameter",
                Type: "String",
            });
        });
        test("createParameter should respect custom project name", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                projectName: "CustomProject",
                env: {
                    account: "123456789012",
                    region: "us-east-1",
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::SSM::Parameter", {
                Name: "/customproject/dev/test-value",
                Value: "test-123",
            });
        });
    });
    describe("Configuration Access", () => {
        test("should provide access to environment configuration", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                deploymentEnvironment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            expect(stack.config.database.minCapacity).toBe(0.5);
            expect(stack.config.compute.lambdaMemory).toBe(1024);
            expect(stack.config.costOptimization).toBe(true);
        });
        test("should provide access to deployment environment string", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                deploymentEnvironment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: testEnv,
            });
            expect(stack.deploymentEnvironment).toBe("prod");
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFzZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQWtDO0FBQ2xDLHVEQUF3RDtBQUV4RCxxRUFBZ0Y7QUFDaEYsdUZBQWtGO0FBRWxGLG1DQUFtQztBQUNuQyxNQUFNLFNBQVUsU0FBUSxzQkFBUztJQUNyQixlQUFlLENBQUMsS0FBcUI7UUFDN0Msd0NBQXdDO1FBQ3hDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN4QyxhQUFhLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFO1NBQ3ZDLENBQUMsQ0FBQTtRQUVGLHVDQUF1QztRQUN2QyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQTtJQUNsRSxDQUFDO0NBQ0Y7QUFFRCxRQUFRLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtJQUN6QixJQUFJLEdBQVksQ0FBQTtJQUVoQiwyQ0FBMkM7SUFDM0MsTUFBTSxPQUFPLEdBQUc7UUFDZCxPQUFPLEVBQUUsY0FBYztRQUN2QixNQUFNLEVBQUUsV0FBVztLQUNwQixDQUFBO0lBRUQsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtJQUNyQixDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFDOUMsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUM5RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxxQkFBcUIsRUFBRSxLQUFLO2dCQUM1QixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FB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QUksU0FBUyxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRTtnQkFDakQscUJBQXFCLEVBQUUsTUFBTTtnQkFDN0IsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7Z0JBQ3JDLEdBQUcsRUFBRSxPQUFPO2FBQ2IsQ0FBQyxDQUFBO1lBRUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUNsRCxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQyxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCJcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCJcbmltcG9ydCB7IEJhc2VTdGFjaywgQmFzZVN0YWNrUHJvcHMgfSBmcm9tIFwiLi4vLi4vbGliL2NvbnN0cnVjdHMvYmFzZS9iYXNlLXN0YWNrXCJcbmltcG9ydCB7IEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSBcIi4uLy4uL2xpYi9jb25zdHJ1Y3RzL2NvbmZpZy9lbnZpcm9ubWVudC1jb25maWdcIlxuXG4vLyBUZXN0IGltcGxlbWVudGF0aW9uIG9mIEJhc2VTdGFja1xuY2xhc3MgVGVzdFN0YWNrIGV4dGVuZHMgQmFzZVN0YWNrIHtcbiAgcHJvdGVjdGVkIGRlZmluZVJlc291cmNlcyhwcm9wczogQmFzZVN0YWNrUHJvcHMpOiB2b2lkIHtcbiAgICAvLyBDcmVhdGUgYSBzaW1wbGUgUzMgYnVja2V0IGZvciB0ZXN0aW5nXG4gICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHRoaXMsIFwiVGVzdEJ1Y2tldFwiLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiB0aGlzLmdldFJlbW92YWxQb2xpY3koKSxcbiAgICB9KVxuXG4gICAgLy8gQ3JlYXRlIGFuIFNTTSBwYXJhbWV0ZXIgdXNpbmcgaGVscGVyXG4gICAgdGhpcy5jcmVhdGVQYXJhbWV0ZXIoXCJ0ZXN0LXZhbHVlXCIsIFwidGVzdC0xMjNcIiwgXCJUZXN0IHBhcmFtZXRlclwiKVxuICB9XG59XG5cbmRlc2NyaWJlKFwiQmFzZVN0YWNrXCIsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcFxuXG4gIC8vIFN0YW5kYXJkIHRlc3QgZW52aXJvbm1lbnQgZm9yIENESyBzdGFja3NcbiAgY29uc3QgdGVzdEVudiA9IHtcbiAgICBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLFxuICAgIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIixcbiAgfVxuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGFwcCA9IG5ldyBjZGsuQXBwKClcbiAgfSlcblxuICBkZXNjcmliZShcIlN0YWNrIE5hbWluZyBhbmQgQ29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBjcmVhdGUgc3RhY2sgd2l0aCBjb3JyZWN0IG5hbWluZyBjb252ZW50aW9uXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGRlcGxveW1lbnRFbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsXG4gICAgICAgICAgcmVnaW9uOiBcInVzLWVhc3QtMVwiLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnN0YWNrTmFtZSkudG9CZShcIkFJU3R1ZGlvLVRlc3RTdGFjay1EZXYtZGV2XCIpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgdXNlIGN1c3RvbSBwcm9qZWN0IG5hbWUgaW4gc3RhY2sgbmFtZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJDdXN0b21Qcm9qZWN0XCIsXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsXG4gICAgICAgICAgcmVnaW9uOiBcInVzLWVhc3QtMVwiLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnN0YWNrTmFtZSkudG9CZShcIkN1c3RvbVByb2plY3QtVGVzdFN0YWNrLURldi1kZXZcIilcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBzZXQgZGVzY3JpcHRpb24gYmFzZWQgb24gZW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICBleHBlY3QodGVtcGxhdGUudG9KU09OKCkuRGVzY3JpcHRpb24pLnRvQmUoXCJUZXN0U3RhY2stRGV2IGZvciBkZXYgZW52aXJvbm1lbnRcIilcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiVGVybWluYXRpb24gUHJvdGVjdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBlbmFibGUgdGVybWluYXRpb24gcHJvdGVjdGlvbiBmb3IgcHJvZFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1Qcm9kXCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBleHBlY3Qoc3RhY2sudGVybWluYXRpb25Qcm90ZWN0aW9uKS50b0JlKHRydWUpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgZGlzYWJsZSB0ZXJtaW5hdGlvbiBwcm90ZWN0aW9uIGZvciBkZXZcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnRlcm1pbmF0aW9uUHJvdGVjdGlvbikudG9CZShmYWxzZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBkaXNhYmxlIHRlcm1pbmF0aW9uIHByb3RlY3Rpb24gZm9yIHN0YWdpbmdcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stU3RhZ2luZ1wiLCB7XG4gICAgICAgIGRlcGxveW1lbnRFbnZpcm9ubWVudDogXCJzdGFnaW5nXCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwic3RhZ2luZ1wiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnRlcm1pbmF0aW9uUHJvdGVjdGlvbikudG9CZShmYWxzZSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQXV0b21hdGljIFRhZ2dpbmdcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgYXBwbHkgYWxsIHN0YW5kYXJkIHRhZ3MgdG8gcmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGRlcGxveW1lbnRFbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICAgIGVudjogdGVzdEVudixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICAvLyBDaGVjayB0aGF0IGJ1Y2tldCBoYXMgdGFncyAoVGFnZ2luZ0FzcGVjdCBzaG91bGQgYXBwbHkgdGhlbSlcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbeyBLZXk6IFwiRW52aXJvbm1lbnRcIiwgVmFsdWU6IFwiRGV2XCIgfV0pLFxuICAgICAgfSlcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbeyBLZXk6IFwiUHJvamVjdFwiLCBWYWx1ZTogXCJBSVN0dWRpb1wiIH1dKSxcbiAgICAgIH0pXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW3sgS2V5OiBcIk93bmVyXCIsIFZhbHVlOiBcIlRTRCBFbmdpbmVlcmluZ1wiIH1dKSxcbiAgICAgIH0pXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW3sgS2V5OiBcIk1hbmFnZWRCeVwiLCBWYWx1ZTogXCJDREtcIiB9XSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNhcGl0YWxpemUgZW52aXJvbm1lbnQgaW4gdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1Qcm9kXCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJQcm9kXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGFwcGx5IGN1c3RvbSBwcm9qZWN0IG5hbWUgdG8gdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJDdXN0b21Qcm9qZWN0XCIsXG4gICAgICAgIGVudjogdGVzdEVudixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIlByb2plY3RcIiwgVmFsdWU6IFwiQ3VzdG9tUHJvamVjdFwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBhcHBseSBjdXN0b20gb3duZXIgdG8gdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBvd25lcjogXCJDdXN0b20gVGVhbVwiLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJPd25lclwiLCBWYWx1ZTogXCJDdXN0b20gVGVhbVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiU3RhbmRhcmQgT3V0cHV0c1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBjcmVhdGUgU3RhY2tFbnZpcm9ubWVudCBvdXRwdXRcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlN0YWNrRW52aXJvbm1lbnRcIiwge1xuICAgICAgICBWYWx1ZTogXCJkZXZcIixcbiAgICAgICAgRGVzY3JpcHRpb246IFwiRW52aXJvbm1lbnQgZm9yIHRoaXMgc3RhY2tcIixcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogXCJBSVN0dWRpby1UZXN0U3RhY2stRGV2LWRldi1FbnZpcm9ubWVudFwiLFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjcmVhdGUgU3RhY2tWZXJzaW9uIG91dHB1dFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiU3RhY2tWZXJzaW9uXCIsIHtcbiAgICAgICAgRGVzY3JpcHRpb246IFwiQ0RLIHZlcnNpb24gdXNlZCBmb3IgZGVwbG95bWVudFwiLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiSGVscGVyIE1ldGhvZHNcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJnZXRSZW1vdmFsUG9saWN5IHNob3VsZCByZXR1cm4gUkVUQUlOIGZvciBwcm9kXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLVByb2RcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcInByb2RcIiksXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsXG4gICAgICAgICAgcmVnaW9uOiBcInVzLWVhc3QtMVwiLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIEJ1Y2tldCBzaG91bGQgaGF2ZSBEZWxldGlvblBvbGljeTogUmV0YWluXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZShcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIERlbGV0aW9uUG9saWN5OiBcIlJldGFpblwiLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImdldFJlbW92YWxQb2xpY3kgc2hvdWxkIHJldHVybiBERVNUUk9ZIGZvciBkZXZcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIixcbiAgICAgICAgICByZWdpb246IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gQnVja2V0IHNob3VsZCBoYXZlIERlbGV0aW9uUG9saWN5OiBEZWxldGVcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgRGVsZXRpb25Qb2xpY3k6IFwiRGVsZXRlXCIsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiZ2V0RW52VmFsdWUgc2hvdWxkIHJldHVybiBkZXYgdmFsdWUgZm9yIGRldiBlbnZpcm9ubWVudFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICAvLyBBY2Nlc3MgdGhlIHByb3RlY3RlZCBtZXRob2QgdGhyb3VnaCBhIHR5cGUgYXNzZXJ0aW9uXG4gICAgICBjb25zdCByZXN1bHQgPSAoc3RhY2sgYXMgYW55KS5nZXRFbnZWYWx1ZShcImRldi12YWx1ZVwiLCBcInByb2QtdmFsdWVcIilcbiAgICAgIGV4cGVjdChyZXN1bHQpLnRvQmUoXCJkZXYtdmFsdWVcIilcbiAgICB9KVxuXG4gICAgdGVzdChcImdldEVudlZhbHVlIHNob3VsZCByZXR1cm4gcHJvZCB2YWx1ZSBmb3IgcHJvZCBlbnZpcm9ubWVudFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1Qcm9kXCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCByZXN1bHQgPSAoc3RhY2sgYXMgYW55KS5nZXRFbnZWYWx1ZShcImRldi12YWx1ZVwiLCBcInByb2QtdmFsdWVcIilcbiAgICAgIGV4cGVjdChyZXN1bHQpLnRvQmUoXCJwcm9kLXZhbHVlXCIpXG4gICAgfSlcblxuICAgIHRlc3QoXCJjcmVhdGVQYXJhbWV0ZXIgc2hvdWxkIGNyZWF0ZSBTU00gcGFyYW1ldGVyIHdpdGggY29ycmVjdCBuYW1pbmdcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIixcbiAgICAgICAgICByZWdpb246IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTU006OlBhcmFtZXRlclwiLCB7XG4gICAgICAgIE5hbWU6IFwiL2Fpc3R1ZGlvL2Rldi90ZXN0LXZhbHVlXCIsXG4gICAgICAgIFZhbHVlOiBcInRlc3QtMTIzXCIsXG4gICAgICAgIERlc2NyaXB0aW9uOiBcIlRlc3QgcGFyYW1ldGVyXCIsXG4gICAgICAgIFR5cGU6IFwiU3RyaW5nXCIsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlUGFyYW1ldGVyIHNob3VsZCByZXNwZWN0IGN1c3RvbSBwcm9qZWN0IG5hbWVcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZGVwbG95bWVudEVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQ3VzdG9tUHJvamVjdFwiLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLFxuICAgICAgICAgIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIixcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNTTTo6UGFyYW1ldGVyXCIsIHtcbiAgICAgICAgTmFtZTogXCIvY3VzdG9tcHJvamVjdC9kZXYvdGVzdC12YWx1ZVwiLFxuICAgICAgICBWYWx1ZTogXCJ0ZXN0LTEyM1wiLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQ29uZmlndXJhdGlvbiBBY2Nlc3NcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgcHJvdmlkZSBhY2Nlc3MgdG8gZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBleHBlY3Qoc3RhY2suY29uZmlnLmRhdGFiYXNlLm1pbkNhcGFjaXR5KS50b0JlKDAuNSlcbiAgICAgIGV4cGVjdChzdGFjay5jb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpLnRvQmUoMTAyNClcbiAgICAgIGV4cGVjdChzdGFjay5jb25maWcuY29zdE9wdGltaXphdGlvbikudG9CZSh0cnVlKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIHByb3ZpZGUgYWNjZXNzIHRvIGRlcGxveW1lbnQgZW52aXJvbm1lbnQgc3RyaW5nXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLVByb2RcIiwge1xuICAgICAgICBkZXBsb3ltZW50RW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcInByb2RcIiksXG4gICAgICAgIGVudjogdGVzdEVudixcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChzdGFjay5kZXBsb3ltZW50RW52aXJvbm1lbnQpLnRvQmUoXCJwcm9kXCIpXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=