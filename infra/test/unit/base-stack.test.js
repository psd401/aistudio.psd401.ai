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
                environment: "dev",
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
                environment: "dev",
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
                environment: "dev",
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
                environment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: testEnv,
            });
            expect(stack.terminationProtection).toBe(true);
        });
        test("should disable termination protection for dev", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                environment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            expect(stack.terminationProtection).toBe(false);
        });
        test("should disable termination protection for staging", () => {
            const stack = new TestStack(app, "TestStack-Staging", {
                environment: "staging",
                config: environment_config_1.EnvironmentConfig.get("staging"),
                env: testEnv,
            });
            expect(stack.terminationProtection).toBe(false);
        });
    });
    describe("Automatic Tagging", () => {
        test("should apply all standard tags to resources", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                environment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            const template = assertions_1.Template.fromStack(stack);
            // Check that bucket has tags (TaggingAspect should apply them)
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Environment", Value: "Dev" },
                    { Key: "Project", Value: "AIStudio" },
                    { Key: "Owner", Value: "TSD Engineering" },
                    { Key: "ManagedBy", Value: "CDK" },
                ]),
            });
        });
        test("should capitalize environment in tags", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                environment: "prod",
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
                environment: "dev",
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
                environment: "dev",
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
                environment: "dev",
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
                environment: "dev",
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
                environment: "prod",
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
                environment: "dev",
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
                environment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            // Access the protected method through a type assertion
            const result = stack.getEnvValue("dev-value", "prod-value");
            expect(result).toBe("dev-value");
        });
        test("getEnvValue should return prod value for prod environment", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                environment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: testEnv,
            });
            const result = stack.getEnvValue("dev-value", "prod-value");
            expect(result).toBe("prod-value");
        });
        test("createParameter should create SSM parameter with correct naming", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                environment: "dev",
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
                environment: "dev",
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
                environment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
                env: testEnv,
            });
            expect(stack.config.database.minCapacity).toBe(0.5);
            expect(stack.config.compute.lambdaMemory).toBe(1024);
            expect(stack.config.costOptimization).toBe(true);
        });
        test("should provide access to environment string", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                environment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
                env: testEnv,
            });
            expect(stack.environment).toBe("prod");
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFzZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQWtDO0FBQ2xDLHVEQUF3RDtBQUV4RCxxRUFBZ0Y7QUFDaEYsdUZBQWtGO0FBRWxGLG1DQUFtQztBQUNuQyxNQUFNLFNBQVUsU0FBUSxzQkFBUztJQUNyQixlQUFlLENBQUMsS0FBcUI7UUFDN0Msd0NBQXdDO1FBQ3hDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN4QyxhQUFhLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFO1NBQ3ZDLENBQUMsQ0FBQTtRQUVGLHVDQUF1QztRQUN2QyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQTtJQUNsRSxDQUFDO0NBQ0Y7QUFFRCxRQUFRLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtJQUN6QixJQUFJLEdBQVksQ0FBQTtJQUVoQiwyQ0FBMkM7SUFDM0MsTUFBTSxPQUFPLEdBQUc7UUFDZCxPQUFPLEVBQUUsY0FBYztRQUN2QixNQUFNLEVBQUUsV0FBVztLQUNwQixDQUFBO0lBRUQsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtJQUNyQixDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxnQ0FBZ0MsRUFBRSxHQUFHLEVBQUU7UUFDOUMsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUM5RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLEdBQUcsRUFBRTtvQkFDSCxPQUFPLEVBQUUsY0FBYztvQkFDdkIsTUFBTSxFQUFFLFdBQVc7aUJBQ3BCO2FBQ0YsQ0FBQyxDQUFBO1lBRUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLENBQUMsNEJBQTRCLENBQUMsQ0FBQTtRQUM1RCxDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyw4Q0FBOEMsRUFBRSxHQUFHLEVBQUU7WUFDeEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2dCQUNwQyxXQUFXLEVBQUUsZUFBZTtnQkFDNUIsR0FBRyxFQUFFO29CQUNILE9BQU8sRUFBRSxjQUFjO29CQUN2QixNQUFNLEVBQUUsV0FBVztpQkFDcEI7YUFDRixDQUFDLENBQUE7WUFFRixNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFBO1FBQ2pFLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEdBQUcsRUFBRTtZQUN2RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLEdBQUcsRUFBRSxPQUFPO2FBQ2IsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDMUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxJQUFJLENBQUMsbUNBQW1DLENBQUMsQ0FBQTtRQUNqRixDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0lBRUYsUUFBUSxDQUFDLHdCQUF3QixFQUFFLEdBQUcsRUFBRTtRQUN0QyxJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1lBQ3pELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRTtnQkFDakQsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2dCQUNyQyxHQUFHLEVBQUUsT0FBTzthQUNiLENBQUMsQ0FBQTtZQUVGLE1BQU0sQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDaEQsQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsK0NBQStDLEVBQUUsR0FBRyxFQUFFO1lBQ3pELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFDcEMsR0FBRyxFQUFFLE9BQU87YUFDYixDQUFDLENBQUE7WUFFRixNQUFNLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQ2pELENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtZQUM3RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLEVBQUU7Z0JBQ3BELFdBQVcsRUFBRSxTQUFTO2dCQUN0QixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQztnQkFDeEMsR0FBRyxFQUFFLE9BQU87YUFDYixDQUFDLENBQUE7WUFFRixNQUFNLENBQUMsS0FBSyxDQUFDLHFCQUFxQixDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQ2pELENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO1FBQ2pDLElBQUksQ0FBQyw2Q0FBNkMsRUFBRSxHQUFHLEVBQUU7WUFDdkQsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2dCQUNwQyxHQUFHLEVBQUUsT0FBTzthQUNiLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLCtEQUErRDtZQUMvRCxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUU7b0JBQ3BDLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFO29CQUNyQyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixFQUFFO29CQUMxQyxFQUFFLEdBQUcsRUFBRSxXQUFXLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtpQkFDbkMsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLHVDQUF1QyxFQUFFLEdBQUcsRUFBRTtZQUNqRCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLEVBQUU7Z0JBQ2pELFdBQVcsRUFBRSxNQUFNO2dCQUNuQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQztnQkFDckMsR0FBRyxFQUFFLE9BQU87YUFDYixDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7aUJBQ3RDLENBQUM7YUFDSCxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQywwQ0FBMEMsRUFBRSxHQUFHLEVBQUU7WUFDcEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2dCQUNwQyxXQUFXLEVBQUUsZUFBZTtnQkFDNUIsR0FBRyxFQUFFLE9BQU87YUFDYixDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxlQUFlLEVBQUU7aUJBQzNDLENBQUM7YUFDSCxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7WUFDN0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2dCQUNwQyxLQUFLLEVBQUUsYUFBYTtnQkFDcEIsR0FBRyxFQUFFLE9BQU87YUFDYixDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUU7aUJBQ3ZDLENBQUM7YUFDSCxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0lBRUYsUUFBUSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUNoQyxJQUFJLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO1lBQ2pELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFDcEMsR0FBRyxFQUFFLE9BQU87YUFDYixDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMsU0FBUyxDQUFDLGtCQUFrQixFQUFFO2dCQUNyQyxLQUFLLEVBQUUsS0FBSztnQkFDWixXQUFXLEVBQUUsNEJBQTRCO2dCQUN6QyxNQUFNLEVBQUU7b0JBQ04sSUFBSSxFQUFFLHdDQUF3QztpQkFDL0M7YUFDRixDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7WUFDN0MsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2dCQUNwQyxHQUFHLEVBQUUsT0FBTzthQUNiLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFO2dCQUNqQyxXQUFXLEVBQUUsaUNBQWlDO2FBQy9DLENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO1FBQzlCLElBQUksQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLEVBQUU7WUFDMUQsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFO2dCQUNqRCxXQUFXLEVBQUUsTUFBTTtnQkFDbkIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7Z0JBQ3JDLEdBQUcsRUFBRTtvQkFDSCxPQUFPLEVBQUUsY0FBYztvQkFDdkIsTUFBTSxFQUFFLFdBQVc7aUJBQ3BCO2FBQ0YsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsNENBQTRDO1lBQzVDLFFBQVEsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ3RDLGNBQWMsRUFBRSxRQUFRO2FBQ3pCLENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtZQUMxRCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLEdBQUcsRUFBRTtvQkFDSCxPQUFPLEVBQUUsY0FBYztvQkFDdkIsTUFBTSxFQUFFLFdBQVc7aUJBQ3BCO2FBQ0YsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsNENBQTRDO1lBQzVDLFFBQVEsQ0FBQyxXQUFXLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ3RDLGNBQWMsRUFBRSxRQUFRO2FBQ3pCLENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLHlEQUF5RCxFQUFFLEdBQUcsRUFBRTtZQUNuRSxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLEdBQUcsRUFBRSxPQUFPO2FBQ2IsQ0FBQyxDQUFBO1lBRUYsdURBQXVEO1lBQ3ZELE1BQU0sTUFBTSxHQUFJLEtBQWEsQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBQ3BFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUE7UUFDbEMsQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsMkRBQTJELEVBQUUsR0FBRyxFQUFFO1lBQ3JFLE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRTtnQkFDakQsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2dCQUNyQyxHQUFHLEVBQUUsT0FBTzthQUNiLENBQUMsQ0FBQTtZQUVGLE1BQU0sTUFBTSxHQUFJLEtBQWEsQ0FBQyxXQUFXLENBQUMsV0FBVyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBQ3BFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUE7UUFDbkMsQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsaUVBQWlFLEVBQUUsR0FBRyxFQUFFO1lBQzNFLE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFDcEMsR0FBRyxFQUFFO29CQUNILE9BQU8sRUFBRSxjQUFjO29CQUN2QixNQUFNLEVBQUUsV0FBVztpQkFDcEI7YUFDRixDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMscUJBQXFCLEVBQUU7Z0JBQ3BELElBQUksRUFBRSwwQkFBMEI7Z0JBQ2hDLEtBQUssRUFBRSxVQUFVO2dCQUNqQixXQUFXLEVBQUUsZ0JBQWdCO2dCQUM3QixJQUFJLEVBQUUsUUFBUTthQUNmLENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUM5RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLFdBQVcsRUFBRSxlQUFlO2dCQUM1QixHQUFHLEVBQUU7b0JBQ0gsT0FBTyxFQUFFLGNBQWM7b0JBQ3ZCLE1BQU0sRUFBRSxXQUFXO2lCQUNwQjthQUNGLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsRUFBRTtnQkFDcEQsSUFBSSxFQUFFLCtCQUErQjtnQkFDckMsS0FBSyxFQUFFLFVBQVU7YUFDbEIsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDcEMsSUFBSSxDQUFDLG9EQUFvRCxFQUFFLEdBQUcsRUFBRTtZQUM5RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLEdBQUcsRUFBRSxPQUFPO2FBQ2IsQ0FBQyxDQUFBO1lBRUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQTtZQUNuRCxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsWUFBWSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1lBQ3BELE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBQ2xELENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEdBQUcsRUFBRTtZQUN2RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLEVBQUU7Z0JBQ2pELFdBQVcsRUFBRSxNQUFNO2dCQUNuQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQztnQkFDckMsR0FBRyxFQUFFLE9BQU87YUFDYixDQUFDLENBQUE7WUFFRixNQUFNLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN4QyxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQyxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCJcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCJcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCJcbmltcG9ydCB7IEJhc2VTdGFjaywgQmFzZVN0YWNrUHJvcHMgfSBmcm9tIFwiLi4vLi4vbGliL2NvbnN0cnVjdHMvYmFzZS9iYXNlLXN0YWNrXCJcbmltcG9ydCB7IEVudmlyb25tZW50Q29uZmlnIH0gZnJvbSBcIi4uLy4uL2xpYi9jb25zdHJ1Y3RzL2NvbmZpZy9lbnZpcm9ubWVudC1jb25maWdcIlxuXG4vLyBUZXN0IGltcGxlbWVudGF0aW9uIG9mIEJhc2VTdGFja1xuY2xhc3MgVGVzdFN0YWNrIGV4dGVuZHMgQmFzZVN0YWNrIHtcbiAgcHJvdGVjdGVkIGRlZmluZVJlc291cmNlcyhwcm9wczogQmFzZVN0YWNrUHJvcHMpOiB2b2lkIHtcbiAgICAvLyBDcmVhdGUgYSBzaW1wbGUgUzMgYnVja2V0IGZvciB0ZXN0aW5nXG4gICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHRoaXMsIFwiVGVzdEJ1Y2tldFwiLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiB0aGlzLmdldFJlbW92YWxQb2xpY3koKSxcbiAgICB9KVxuXG4gICAgLy8gQ3JlYXRlIGFuIFNTTSBwYXJhbWV0ZXIgdXNpbmcgaGVscGVyXG4gICAgdGhpcy5jcmVhdGVQYXJhbWV0ZXIoXCJ0ZXN0LXZhbHVlXCIsIFwidGVzdC0xMjNcIiwgXCJUZXN0IHBhcmFtZXRlclwiKVxuICB9XG59XG5cbmRlc2NyaWJlKFwiQmFzZVN0YWNrXCIsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcFxuXG4gIC8vIFN0YW5kYXJkIHRlc3QgZW52aXJvbm1lbnQgZm9yIENESyBzdGFja3NcbiAgY29uc3QgdGVzdEVudiA9IHtcbiAgICBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLFxuICAgIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIixcbiAgfVxuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGFwcCA9IG5ldyBjZGsuQXBwKClcbiAgfSlcblxuICBkZXNjcmliZShcIlN0YWNrIE5hbWluZyBhbmQgQ29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBjcmVhdGUgc3RhY2sgd2l0aCBjb3JyZWN0IG5hbWluZyBjb252ZW50aW9uXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIixcbiAgICAgICAgICByZWdpb246IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBleHBlY3Qoc3RhY2suc3RhY2tOYW1lKS50b0JlKFwiQUlTdHVkaW8tVGVzdFN0YWNrLURldi1kZXZcIilcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCB1c2UgY3VzdG9tIHByb2plY3QgbmFtZSBpbiBzdGFjayBuYW1lXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQ3VzdG9tUHJvamVjdFwiLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLFxuICAgICAgICAgIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIixcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChzdGFjay5zdGFja05hbWUpLnRvQmUoXCJDdXN0b21Qcm9qZWN0LVRlc3RTdGFjay1EZXYtZGV2XCIpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgc2V0IGRlc2NyaXB0aW9uIGJhc2VkIG9uIGVudmlyb25tZW50XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICBleHBlY3QodGVtcGxhdGUudG9KU09OKCkuRGVzY3JpcHRpb24pLnRvQmUoXCJUZXN0U3RhY2stRGV2IGZvciBkZXYgZW52aXJvbm1lbnRcIilcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiVGVybWluYXRpb24gUHJvdGVjdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBlbmFibGUgdGVybWluYXRpb24gcHJvdGVjdGlvbiBmb3IgcHJvZFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1Qcm9kXCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcInByb2RcIiksXG4gICAgICAgIGVudjogdGVzdEVudixcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChzdGFjay50ZXJtaW5hdGlvblByb3RlY3Rpb24pLnRvQmUodHJ1ZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBkaXNhYmxlIHRlcm1pbmF0aW9uIHByb3RlY3Rpb24gZm9yIGRldlwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICAgIGVudjogdGVzdEVudixcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChzdGFjay50ZXJtaW5hdGlvblByb3RlY3Rpb24pLnRvQmUoZmFsc2UpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgZGlzYWJsZSB0ZXJtaW5hdGlvbiBwcm90ZWN0aW9uIGZvciBzdGFnaW5nXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLVN0YWdpbmdcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJzdGFnaW5nXCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwic3RhZ2luZ1wiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnRlcm1pbmF0aW9uUHJvdGVjdGlvbikudG9CZShmYWxzZSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQXV0b21hdGljIFRhZ2dpbmdcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgYXBwbHkgYWxsIHN0YW5kYXJkIHRhZ3MgdG8gcmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIENoZWNrIHRoYXQgYnVja2V0IGhhcyB0YWdzIChUYWdnaW5nQXNwZWN0IHNob3VsZCBhcHBseSB0aGVtKVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJEZXZcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIlByb2plY3RcIiwgVmFsdWU6IFwiQUlTdHVkaW9cIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIk93bmVyXCIsIFZhbHVlOiBcIlRTRCBFbmdpbmVlcmluZ1wiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiTWFuYWdlZEJ5XCIsIFZhbHVlOiBcIkNES1wiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjYXBpdGFsaXplIGVudmlyb25tZW50IGluIHRhZ3NcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stUHJvZFwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJQcm9kXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGFwcGx5IGN1c3RvbSBwcm9qZWN0IG5hbWUgdG8gdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkN1c3RvbVByb2plY3RcIixcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiUHJvamVjdFwiLCBWYWx1ZTogXCJDdXN0b21Qcm9qZWN0XCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGFwcGx5IGN1c3RvbSBvd25lciB0byB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgb3duZXI6IFwiQ3VzdG9tIFRlYW1cIixcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiT3duZXJcIiwgVmFsdWU6IFwiQ3VzdG9tIFRlYW1cIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIlN0YW5kYXJkIE91dHB1dHNcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgY3JlYXRlIFN0YWNrRW52aXJvbm1lbnQgb3V0cHV0XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIlN0YWNrRW52aXJvbm1lbnRcIiwge1xuICAgICAgICBWYWx1ZTogXCJkZXZcIixcbiAgICAgICAgRGVzY3JpcHRpb246IFwiRW52aXJvbm1lbnQgZm9yIHRoaXMgc3RhY2tcIixcbiAgICAgICAgRXhwb3J0OiB7XG4gICAgICAgICAgTmFtZTogXCJBSVN0dWRpby1UZXN0U3RhY2stRGV2LWRldi1FbnZpcm9ubWVudFwiLFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjcmVhdGUgU3RhY2tWZXJzaW9uIG91dHB1dFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICAgIGVudjogdGVzdEVudixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJTdGFja1ZlcnNpb25cIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogXCJDREsgdmVyc2lvbiB1c2VkIGZvciBkZXBsb3ltZW50XCIsXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJIZWxwZXIgTWV0aG9kc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcImdldFJlbW92YWxQb2xpY3kgc2hvdWxkIHJldHVybiBSRVRBSU4gZm9yIHByb2RcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stUHJvZFwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLFxuICAgICAgICAgIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIixcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICAvLyBCdWNrZXQgc2hvdWxkIGhhdmUgRGVsZXRpb25Qb2xpY3k6IFJldGFpblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2UoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBEZWxldGlvblBvbGljeTogXCJSZXRhaW5cIixcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJnZXRSZW1vdmFsUG9saWN5IHNob3VsZCByZXR1cm4gREVTVFJPWSBmb3IgZGV2XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIixcbiAgICAgICAgICByZWdpb246IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gQnVja2V0IHNob3VsZCBoYXZlIERlbGV0aW9uUG9saWN5OiBEZWxldGVcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgRGVsZXRpb25Qb2xpY3k6IFwiRGVsZXRlXCIsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiZ2V0RW52VmFsdWUgc2hvdWxkIHJldHVybiBkZXYgdmFsdWUgZm9yIGRldiBlbnZpcm9ubWVudFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICAgIGVudjogdGVzdEVudixcbiAgICAgIH0pXG5cbiAgICAgIC8vIEFjY2VzcyB0aGUgcHJvdGVjdGVkIG1ldGhvZCB0aHJvdWdoIGEgdHlwZSBhc3NlcnRpb25cbiAgICAgIGNvbnN0IHJlc3VsdCA9IChzdGFjayBhcyBhbnkpLmdldEVudlZhbHVlKFwiZGV2LXZhbHVlXCIsIFwicHJvZC12YWx1ZVwiKVxuICAgICAgZXhwZWN0KHJlc3VsdCkudG9CZShcImRldi12YWx1ZVwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiZ2V0RW52VmFsdWUgc2hvdWxkIHJldHVybiBwcm9kIHZhbHVlIGZvciBwcm9kIGVudmlyb25tZW50XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLVByb2RcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwicHJvZFwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgcmVzdWx0ID0gKHN0YWNrIGFzIGFueSkuZ2V0RW52VmFsdWUoXCJkZXYtdmFsdWVcIiwgXCJwcm9kLXZhbHVlXCIpXG4gICAgICBleHBlY3QocmVzdWx0KS50b0JlKFwicHJvZC12YWx1ZVwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlUGFyYW1ldGVyIHNob3VsZCBjcmVhdGUgU1NNIHBhcmFtZXRlciB3aXRoIGNvcnJlY3QgbmFtaW5nXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogXCIxMjM0NTY3ODkwMTJcIixcbiAgICAgICAgICByZWdpb246IFwidXMtZWFzdC0xXCIsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTU006OlBhcmFtZXRlclwiLCB7XG4gICAgICAgIE5hbWU6IFwiL2Fpc3R1ZGlvL2Rldi90ZXN0LXZhbHVlXCIsXG4gICAgICAgIFZhbHVlOiBcInRlc3QtMTIzXCIsXG4gICAgICAgIERlc2NyaXB0aW9uOiBcIlRlc3QgcGFyYW1ldGVyXCIsXG4gICAgICAgIFR5cGU6IFwiU3RyaW5nXCIsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlUGFyYW1ldGVyIHNob3VsZCByZXNwZWN0IGN1c3RvbSBwcm9qZWN0IG5hbWVcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJDdXN0b21Qcm9qZWN0XCIsXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsXG4gICAgICAgICAgcmVnaW9uOiBcInVzLWVhc3QtMVwiLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6U1NNOjpQYXJhbWV0ZXJcIiwge1xuICAgICAgICBOYW1lOiBcIi9jdXN0b21wcm9qZWN0L2Rldi90ZXN0LXZhbHVlXCIsXG4gICAgICAgIFZhbHVlOiBcInRlc3QtMTIzXCIsXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJDb25maWd1cmF0aW9uIEFjY2Vzc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBwcm92aWRlIGFjY2VzcyB0byBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgZW52OiB0ZXN0RW52LFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLmNvbmZpZy5kYXRhYmFzZS5taW5DYXBhY2l0eSkudG9CZSgwLjUpXG4gICAgICBleHBlY3Qoc3RhY2suY29uZmlnLmNvbXB1dGUubGFtYmRhTWVtb3J5KS50b0JlKDEwMjQpXG4gICAgICBleHBlY3Qoc3RhY2suY29uZmlnLmNvc3RPcHRpbWl6YXRpb24pLnRvQmUodHJ1ZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBwcm92aWRlIGFjY2VzcyB0byBlbnZpcm9ubWVudCBzdHJpbmdcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stUHJvZFwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgICBlbnY6IHRlc3RFbnYsXG4gICAgICB9KVxuXG4gICAgICBleHBlY3Qoc3RhY2suZW52aXJvbm1lbnQpLnRvQmUoXCJwcm9kXCIpXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=