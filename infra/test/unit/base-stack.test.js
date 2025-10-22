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
            });
            expect(stack.terminationProtection).toBe(true);
        });
        test("should disable termination protection for dev", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                environment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
            });
            expect(stack.terminationProtection).toBe(false);
        });
        test("should disable termination protection for staging", () => {
            const stack = new TestStack(app, "TestStack-Staging", {
                environment: "staging",
                config: environment_config_1.EnvironmentConfig.get("staging"),
            });
            expect(stack.terminationProtection).toBe(false);
        });
    });
    describe("Automatic Tagging", () => {
        test("should apply all standard tags to resources", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                environment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
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
            });
            // Access the protected method through a type assertion
            const result = stack.getEnvValue("dev-value", "prod-value");
            expect(result).toBe("dev-value");
        });
        test("getEnvValue should return prod value for prod environment", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                environment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
            });
            const result = stack.getEnvValue("dev-value", "prod-value");
            expect(result).toBe("prod-value");
        });
        test("createParameter should create SSM parameter with correct naming", () => {
            const stack = new TestStack(app, "TestStack-Dev", {
                environment: "dev",
                config: environment_config_1.EnvironmentConfig.get("dev"),
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
            });
            expect(stack.config.database.minCapacity).toBe(0.5);
            expect(stack.config.compute.lambdaMemory).toBe(1024);
            expect(stack.config.costOptimization).toBe(true);
        });
        test("should provide access to environment string", () => {
            const stack = new TestStack(app, "TestStack-Prod", {
                environment: "prod",
                config: environment_config_1.EnvironmentConfig.get("prod"),
            });
            expect(stack.environment).toBe("prod");
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFzZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQWtDO0FBQ2xDLHVEQUF3RDtBQUV4RCxxRUFBZ0Y7QUFDaEYsdUZBQWtGO0FBRWxGLG1DQUFtQztBQUNuQyxNQUFNLFNBQVUsU0FBUSxzQkFBUztJQUNyQixlQUFlLENBQUMsS0FBcUI7UUFDN0Msd0NBQXdDO1FBQ3hDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUN4QyxhQUFhLEVBQUUsSUFBSSxDQUFDLGdCQUFnQixFQUFFO1NBQ3ZDLENBQUMsQ0FBQTtRQUVGLHVDQUF1QztRQUN2QyxJQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksRUFBRSxVQUFVLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQTtJQUNsRSxDQUFDO0NBQ0Y7QUFFRCxRQUFRLENBQUMsV0FBVyxFQUFFLEdBQUcsRUFBRTtJQUN6QixJQUFJLEdBQVksQ0FBQTtJQUVoQixVQUFVLENBQUMsR0FBRyxFQUFFO1FBQ2QsR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFBO0lBQ3JCLENBQUMsQ0FBQyxDQUFBO0lBRUYsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtRQUM5QyxJQUFJLENBQUMsb0RBQW9ELEVBQUUsR0FBRyxFQUFFO1lBQzlELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFDcEMsR0FBRyxFQUFFO29CQUNILE9BQU8sRUFBRSxjQUFjO29CQUN2QixNQUFNLEVBQUUsV0FBVztpQkFDcEI7YUFDRixDQUFDLENBQUE7WUFFRixNQUFNLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxDQUFBO1FBQzVELENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN4RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLFdBQVcsRUFBRSxlQUFlO2dCQUM1QixHQUFHLEVBQUU7b0JBQ0gsT0FBTyxFQUFFLGNBQWM7b0JBQ3ZCLE1BQU0sRUFBRSxXQUFXO2lCQUNwQjthQUNGLENBQUMsQ0FBQTtZQUVGLE1BQU0sQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxDQUFDLGlDQUFpQyxDQUFDLENBQUE7UUFDakUsQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1lBQ3ZELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQzthQUNyQyxDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUMxQyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLFdBQVcsQ0FBQyxDQUFDLElBQUksQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFBO1FBQ2pGLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7WUFDekQsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFO2dCQUNqRCxXQUFXLEVBQUUsTUFBTTtnQkFDbkIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7YUFDdEMsQ0FBQyxDQUFBO1lBRUYsTUFBTSxDQUFDLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQTtRQUNoRCxDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQywrQ0FBK0MsRUFBRSxHQUFHLEVBQUU7WUFDekQsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2FBQ3JDLENBQUMsQ0FBQTtZQUVGLE1BQU0sQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDakQsQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsbURBQW1ELEVBQUUsR0FBRyxFQUFFO1lBQzdELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxtQkFBbUIsRUFBRTtnQkFDcEQsV0FBVyxFQUFFLFNBQVM7Z0JBQ3RCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDO2FBQ3pDLENBQUMsQ0FBQTtZQUVGLE1BQU0sQ0FBQyxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDakQsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSxHQUFHLEVBQUU7UUFDakMsSUFBSSxDQUFDLDZDQUE2QyxFQUFFLEdBQUcsRUFBRTtZQUN2RCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7YUFDckMsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsK0RBQStEO1lBQy9ELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtvQkFDcEMsRUFBRSxHQUFHLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUU7b0JBQ3JDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7b0JBQzFDLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFO2lCQUNuQyxDQUFDO2FBQ0gsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO1lBQ2pELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRTtnQkFDakQsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2FBQ3RDLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtpQkFDdEMsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtZQUNwRCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLFdBQVcsRUFBRSxlQUFlO2FBQzdCLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLGVBQWUsRUFBRTtpQkFDM0MsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRTtZQUM3QyxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7Z0JBQ3BDLEtBQUssRUFBRSxhQUFhO2FBQ3JCLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRTtpQkFDdkMsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsa0JBQWtCLEVBQUUsR0FBRyxFQUFFO1FBQ2hDLElBQUksQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLEVBQUU7WUFDakQsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2FBQ3JDLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsa0JBQWtCLEVBQUU7Z0JBQ3JDLEtBQUssRUFBRSxLQUFLO2dCQUNaLFdBQVcsRUFBRSw0QkFBNEI7Z0JBQ3pDLE1BQU0sRUFBRTtvQkFDTixJQUFJLEVBQUUsd0NBQXdDO2lCQUMvQzthQUNGLENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLG1DQUFtQyxFQUFFLEdBQUcsRUFBRTtZQUM3QyxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZUFBZSxFQUFFO2dCQUNoRCxXQUFXLEVBQUUsS0FBSztnQkFDbEIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7YUFDckMsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUU7Z0JBQ2pDLFdBQVcsRUFBRSxpQ0FBaUM7YUFDL0MsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEdBQUcsRUFBRTtZQUMxRCxNQUFNLEtBQUssR0FBRyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsZ0JBQWdCLEVBQUU7Z0JBQ2pELFdBQVcsRUFBRSxNQUFNO2dCQUNuQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQzthQUN0QyxDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyw0Q0FBNEM7WUFDNUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDdEMsY0FBYyxFQUFFLFFBQVE7YUFDekIsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsZ0RBQWdELEVBQUUsR0FBRyxFQUFFO1lBQzFELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQzthQUNyQyxDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyw0Q0FBNEM7WUFDNUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDdEMsY0FBYyxFQUFFLFFBQVE7YUFDekIsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMseURBQXlELEVBQUUsR0FBRyxFQUFFO1lBQ25FLE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQzthQUNyQyxDQUFDLENBQUE7WUFFRix1REFBdUQ7WUFDdkQsTUFBTSxNQUFNLEdBQUksS0FBYSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFDcEUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQTtRQUNsQyxDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQywyREFBMkQsRUFBRSxHQUFHLEVBQUU7WUFDckUsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFO2dCQUNqRCxXQUFXLEVBQUUsTUFBTTtnQkFDbkIsTUFBTSxFQUFFLHNDQUFpQixDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUM7YUFDdEMsQ0FBQyxDQUFBO1lBRUYsTUFBTSxNQUFNLEdBQUksS0FBYSxDQUFDLFdBQVcsQ0FBQyxXQUFXLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFDcEUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQTtRQUNuQyxDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxpRUFBaUUsRUFBRSxHQUFHLEVBQUU7WUFDM0UsTUFBTSxLQUFLLEdBQUcsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLGVBQWUsRUFBRTtnQkFDaEQsV0FBVyxFQUFFLEtBQUs7Z0JBQ2xCLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO2FBQ3JDLENBQUMsQ0FBQTtZQUVGLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxxQkFBcUIsRUFBRTtnQkFDcEQsSUFBSSxFQUFFLDBCQUEwQjtnQkFDaEMsS0FBSyxFQUFFLFVBQVU7Z0JBQ2pCLFdBQVcsRUFBRSxnQkFBZ0I7Z0JBQzdCLElBQUksRUFBRSxRQUFRO2FBQ2YsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsb0RBQW9ELEVBQUUsR0FBRyxFQUFFO1lBQzlELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQztnQkFDcEMsV0FBVyxFQUFFLGVBQWU7YUFDN0IsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHFCQUFxQixFQUFFO2dCQUNwRCxJQUFJLEVBQUUsK0JBQStCO2dCQUNyQyxLQUFLLEVBQUUsVUFBVTthQUNsQixDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0lBRUYsUUFBUSxDQUFDLHNCQUFzQixFQUFFLEdBQUcsRUFBRTtRQUNwQyxJQUFJLENBQUMsb0RBQW9ELEVBQUUsR0FBRyxFQUFFO1lBQzlELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxlQUFlLEVBQUU7Z0JBQ2hELFdBQVcsRUFBRSxLQUFLO2dCQUNsQixNQUFNLEVBQUUsc0NBQWlCLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQzthQUNyQyxDQUFDLENBQUE7WUFFRixNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFBO1lBQ25ELE1BQU0sQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7WUFDcEQsTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7UUFDbEQsQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxFQUFFO1lBQ3ZELE1BQU0sS0FBSyxHQUFHLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRTtnQkFDakQsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLE1BQU0sRUFBRSxzQ0FBaUIsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDO2FBQ3RDLENBQUMsQ0FBQTtZQUVGLE1BQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3hDLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7QUFDSixDQUFDLENBQUMsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIlxuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSBcImF3cy1jZGstbGliL2Fzc2VydGlvbnNcIlxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIlxuaW1wb3J0IHsgQmFzZVN0YWNrLCBCYXNlU3RhY2tQcm9wcyB9IGZyb20gXCIuLi8uLi9saWIvY29uc3RydWN0cy9iYXNlL2Jhc2Utc3RhY2tcIlxuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tIFwiLi4vLi4vbGliL2NvbnN0cnVjdHMvY29uZmlnL2Vudmlyb25tZW50LWNvbmZpZ1wiXG5cbi8vIFRlc3QgaW1wbGVtZW50YXRpb24gb2YgQmFzZVN0YWNrXG5jbGFzcyBUZXN0U3RhY2sgZXh0ZW5kcyBCYXNlU3RhY2sge1xuICBwcm90ZWN0ZWQgZGVmaW5lUmVzb3VyY2VzKHByb3BzOiBCYXNlU3RhY2tQcm9wcyk6IHZvaWQge1xuICAgIC8vIENyZWF0ZSBhIHNpbXBsZSBTMyBidWNrZXQgZm9yIHRlc3RpbmdcbiAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQodGhpcywgXCJUZXN0QnVja2V0XCIsIHtcbiAgICAgIHJlbW92YWxQb2xpY3k6IHRoaXMuZ2V0UmVtb3ZhbFBvbGljeSgpLFxuICAgIH0pXG5cbiAgICAvLyBDcmVhdGUgYW4gU1NNIHBhcmFtZXRlciB1c2luZyBoZWxwZXJcbiAgICB0aGlzLmNyZWF0ZVBhcmFtZXRlcihcInRlc3QtdmFsdWVcIiwgXCJ0ZXN0LTEyM1wiLCBcIlRlc3QgcGFyYW1ldGVyXCIpXG4gIH1cbn1cblxuZGVzY3JpYmUoXCJCYXNlU3RhY2tcIiwgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwXG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiU3RhY2sgTmFtaW5nIGFuZCBDb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIGNyZWF0ZSBzdGFjayB3aXRoIGNvcnJlY3QgbmFtaW5nIGNvbnZlbnRpb25cIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICBhY2NvdW50OiBcIjEyMzQ1Njc4OTAxMlwiLFxuICAgICAgICAgIHJlZ2lvbjogXCJ1cy1lYXN0LTFcIixcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGV4cGVjdChzdGFjay5zdGFja05hbWUpLnRvQmUoXCJBSVN0dWRpby1UZXN0U3RhY2stRGV2LWRldlwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIHVzZSBjdXN0b20gcHJvamVjdCBuYW1lIGluIHN0YWNrIG5hbWVcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJDdXN0b21Qcm9qZWN0XCIsXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsXG4gICAgICAgICAgcmVnaW9uOiBcInVzLWVhc3QtMVwiLFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnN0YWNrTmFtZSkudG9CZShcIkN1c3RvbVByb2plY3QtVGVzdFN0YWNrLURldi1kZXZcIilcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBzZXQgZGVzY3JpcHRpb24gYmFzZWQgb24gZW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG4gICAgICBleHBlY3QodGVtcGxhdGUudG9KU09OKCkuRGVzY3JpcHRpb24pLnRvQmUoXCJUZXN0U3RhY2stRGV2IGZvciBkZXYgZW52aXJvbm1lbnRcIilcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiVGVybWluYXRpb24gUHJvdGVjdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBlbmFibGUgdGVybWluYXRpb24gcHJvdGVjdGlvbiBmb3IgcHJvZFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1Qcm9kXCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcInByb2RcIiksXG4gICAgICB9KVxuXG4gICAgICBleHBlY3Qoc3RhY2sudGVybWluYXRpb25Qcm90ZWN0aW9uKS50b0JlKHRydWUpXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgZGlzYWJsZSB0ZXJtaW5hdGlvbiBwcm90ZWN0aW9uIGZvciBkZXZcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnRlcm1pbmF0aW9uUHJvdGVjdGlvbikudG9CZShmYWxzZSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBkaXNhYmxlIHRlcm1pbmF0aW9uIHByb3RlY3Rpb24gZm9yIHN0YWdpbmdcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stU3RhZ2luZ1wiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInN0YWdpbmdcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJzdGFnaW5nXCIpLFxuICAgICAgfSlcblxuICAgICAgZXhwZWN0KHN0YWNrLnRlcm1pbmF0aW9uUHJvdGVjdGlvbikudG9CZShmYWxzZSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQXV0b21hdGljIFRhZ2dpbmdcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgYXBwbHkgYWxsIHN0YW5kYXJkIHRhZ3MgdG8gcmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICAvLyBDaGVjayB0aGF0IGJ1Y2tldCBoYXMgdGFncyAoVGFnZ2luZ0FzcGVjdCBzaG91bGQgYXBwbHkgdGhlbSlcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiRW52aXJvbm1lbnRcIiwgVmFsdWU6IFwiRGV2XCIgfSxcbiAgICAgICAgICB7IEtleTogXCJQcm9qZWN0XCIsIFZhbHVlOiBcIkFJU3R1ZGlvXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJPd25lclwiLCBWYWx1ZTogXCJUU0QgRW5naW5lZXJpbmdcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIk1hbmFnZWRCeVwiLCBWYWx1ZTogXCJDREtcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgY2FwaXRhbGl6ZSBlbnZpcm9ubWVudCBpbiB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLVByb2RcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwicHJvZFwiKSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkVudmlyb25tZW50XCIsIFZhbHVlOiBcIlByb2RcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgYXBwbHkgY3VzdG9tIHByb2plY3QgbmFtZSB0byB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQ3VzdG9tUHJvamVjdFwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiUHJvamVjdFwiLCBWYWx1ZTogXCJDdXN0b21Qcm9qZWN0XCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGFwcGx5IGN1c3RvbSBvd25lciB0byB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgICAgb3duZXI6IFwiQ3VzdG9tIFRlYW1cIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIk93bmVyXCIsIFZhbHVlOiBcIkN1c3RvbSBUZWFtXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJTdGFuZGFyZCBPdXRwdXRzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIGNyZWF0ZSBTdGFja0Vudmlyb25tZW50IG91dHB1dFwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzT3V0cHV0KFwiU3RhY2tFbnZpcm9ubWVudFwiLCB7XG4gICAgICAgIFZhbHVlOiBcImRldlwiLFxuICAgICAgICBEZXNjcmlwdGlvbjogXCJFbnZpcm9ubWVudCBmb3IgdGhpcyBzdGFja1wiLFxuICAgICAgICBFeHBvcnQ6IHtcbiAgICAgICAgICBOYW1lOiBcIkFJU3R1ZGlvLVRlc3RTdGFjay1EZXYtZGV2LUVudmlyb25tZW50XCIsXG4gICAgICAgIH0sXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNyZWF0ZSBTdGFja1ZlcnNpb24gb3V0cHV0XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNPdXRwdXQoXCJTdGFja1ZlcnNpb25cIiwge1xuICAgICAgICBEZXNjcmlwdGlvbjogXCJDREsgdmVyc2lvbiB1c2VkIGZvciBkZXBsb3ltZW50XCIsXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJIZWxwZXIgTWV0aG9kc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcImdldFJlbW92YWxQb2xpY3kgc2hvdWxkIHJldHVybiBSRVRBSU4gZm9yIHByb2RcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stUHJvZFwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIEJ1Y2tldCBzaG91bGQgaGF2ZSBEZWxldGlvblBvbGljeTogUmV0YWluXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZShcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIERlbGV0aW9uUG9saWN5OiBcIlJldGFpblwiLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImdldFJlbW92YWxQb2xpY3kgc2hvdWxkIHJldHVybiBERVNUUk9ZIGZvciBkZXZcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIEJ1Y2tldCBzaG91bGQgaGF2ZSBEZWxldGlvblBvbGljeTogRGVsZXRlXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZShcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIERlbGV0aW9uUG9saWN5OiBcIkRlbGV0ZVwiLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImdldEVudlZhbHVlIHNob3VsZCByZXR1cm4gZGV2IHZhbHVlIGZvciBkZXYgZW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stRGV2XCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGNvbmZpZzogRW52aXJvbm1lbnRDb25maWcuZ2V0KFwiZGV2XCIpLFxuICAgICAgfSlcblxuICAgICAgLy8gQWNjZXNzIHRoZSBwcm90ZWN0ZWQgbWV0aG9kIHRocm91Z2ggYSB0eXBlIGFzc2VydGlvblxuICAgICAgY29uc3QgcmVzdWx0ID0gKHN0YWNrIGFzIGFueSkuZ2V0RW52VmFsdWUoXCJkZXYtdmFsdWVcIiwgXCJwcm9kLXZhbHVlXCIpXG4gICAgICBleHBlY3QocmVzdWx0KS50b0JlKFwiZGV2LXZhbHVlXCIpXG4gICAgfSlcblxuICAgIHRlc3QoXCJnZXRFbnZWYWx1ZSBzaG91bGQgcmV0dXJuIHByb2QgdmFsdWUgZm9yIHByb2QgZW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2sgPSBuZXcgVGVzdFN0YWNrKGFwcCwgXCJUZXN0U3RhY2stUHJvZFwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJwcm9kXCIpLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgcmVzdWx0ID0gKHN0YWNrIGFzIGFueSkuZ2V0RW52VmFsdWUoXCJkZXYtdmFsdWVcIiwgXCJwcm9kLXZhbHVlXCIpXG4gICAgICBleHBlY3QocmVzdWx0KS50b0JlKFwicHJvZC12YWx1ZVwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlUGFyYW1ldGVyIHNob3VsZCBjcmVhdGUgU1NNIHBhcmFtZXRlciB3aXRoIGNvcnJlY3QgbmFtaW5nXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrID0gbmV3IFRlc3RTdGFjayhhcHAsIFwiVGVzdFN0YWNrLURldlwiLCB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcImRldlwiKSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNTTTo6UGFyYW1ldGVyXCIsIHtcbiAgICAgICAgTmFtZTogXCIvYWlzdHVkaW8vZGV2L3Rlc3QtdmFsdWVcIixcbiAgICAgICAgVmFsdWU6IFwidGVzdC0xMjNcIixcbiAgICAgICAgRGVzY3JpcHRpb246IFwiVGVzdCBwYXJhbWV0ZXJcIixcbiAgICAgICAgVHlwZTogXCJTdHJpbmdcIixcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJjcmVhdGVQYXJhbWV0ZXIgc2hvdWxkIHJlc3BlY3QgY3VzdG9tIHByb2plY3QgbmFtZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkN1c3RvbVByb2plY3RcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNTTTo6UGFyYW1ldGVyXCIsIHtcbiAgICAgICAgTmFtZTogXCIvY3VzdG9tcHJvamVjdC9kZXYvdGVzdC12YWx1ZVwiLFxuICAgICAgICBWYWx1ZTogXCJ0ZXN0LTEyM1wiLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQ29uZmlndXJhdGlvbiBBY2Nlc3NcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgcHJvdmlkZSBhY2Nlc3MgdG8gZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1EZXZcIiwge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgY29uZmlnOiBFbnZpcm9ubWVudENvbmZpZy5nZXQoXCJkZXZcIiksXG4gICAgICB9KVxuXG4gICAgICBleHBlY3Qoc3RhY2suY29uZmlnLmRhdGFiYXNlLm1pbkNhcGFjaXR5KS50b0JlKDAuNSlcbiAgICAgIGV4cGVjdChzdGFjay5jb25maWcuY29tcHV0ZS5sYW1iZGFNZW1vcnkpLnRvQmUoMTAyNClcbiAgICAgIGV4cGVjdChzdGFjay5jb25maWcuY29zdE9wdGltaXphdGlvbikudG9CZSh0cnVlKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIHByb3ZpZGUgYWNjZXNzIHRvIGVudmlyb25tZW50IHN0cmluZ1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBzdGFjayA9IG5ldyBUZXN0U3RhY2soYXBwLCBcIlRlc3RTdGFjay1Qcm9kXCIsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBjb25maWc6IEVudmlyb25tZW50Q29uZmlnLmdldChcInByb2RcIiksXG4gICAgICB9KVxuXG4gICAgICBleHBlY3Qoc3RhY2suZW52aXJvbm1lbnQpLnRvQmUoXCJwcm9kXCIpXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=