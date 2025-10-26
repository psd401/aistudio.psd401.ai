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
const tagging_aspect_1 = require("../../lib/constructs/base/tagging-aspect");
describe("TaggingAspect", () => {
    let app;
    let stack;
    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack");
    });
    describe("Core Tag Application", () => {
        test("should apply all core tags to taggable resources", () => {
            const config = {
                environment: "dev",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            // Create a taggable resource
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "BusinessUnit", Value: "Technology" },
                    { Key: "Compliance", Value: "None" },
                    { Key: "CostCenter", Value: "DEV-001" },
                    { Key: "DataClassification", Value: "Public" },
                    { Key: "Environment", Value: "Dev" },
                    { Key: "ManagedBy", Value: "CDK" },
                    { Key: "Owner", Value: "TSD Engineering" },
                    { Key: "Project", Value: "AIStudio" },
                    { Key: "Stack", Value: "TestStack" },
                ]),
            });
            // Also verify DeployedAt exists (value is dynamic)
            const resources = template.findResources("AWS::S3::Bucket");
            const bucket = Object.values(resources)[0];
            const deployedAtTag = bucket.Properties.Tags.find((t) => t.Key === "DeployedAt");
            expect(deployedAtTag).toBeDefined();
            expect(deployedAtTag.Value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
        test("should capitalize environment name", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Environment", Value: "Prod" },
                ]),
            });
        });
        test("should handle staging environment", () => {
            const config = {
                environment: "staging",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Environment", Value: "Staging" },
                ]),
            });
        });
    });
    describe("Cost Allocation Tags", () => {
        test("should set cost center to PROD-001 for production", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "CostCenter", Value: "PROD-001" },
                ]),
            });
        });
        test("should set cost center to DEV-001 for non-production", () => {
            const config = {
                environment: "dev",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "CostCenter", Value: "DEV-001" },
                ]),
            });
        });
        test("should always set BusinessUnit to Technology", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "BusinessUnit", Value: "Technology" },
                ]),
            });
        });
    });
    describe("Compliance Tags", () => {
        test("should set compliance to Required for production", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Compliance", Value: "Required" },
                ]),
            });
        });
        test("should set compliance to None for non-production", () => {
            const config = {
                environment: "dev",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Compliance", Value: "None" },
                ]),
            });
        });
    });
    describe("Data Classification", () => {
        test("should classify database resources as Sensitive", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            // Create a database cluster (has "Database" in constructor name)
            new cdk.aws_rds.DatabaseCluster(stack, "TestDatabase", {
                engine: cdk.aws_rds.DatabaseClusterEngine.auroraPostgres({
                    version: cdk.aws_rds.AuroraPostgresEngineVersion.VER_16_8,
                }),
                writer: cdk.aws_rds.ClusterInstance.serverlessV2("writer"),
                vpc: new cdk.aws_ec2.Vpc(stack, "TestVpc"),
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::RDS::DBCluster", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "DataClassification", Value: "Sensitive" },
                ]),
            });
        });
        test("should classify secrets as Sensitive", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_secretsmanager.Secret(stack, "TestSecret");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::SecretsManager::Secret", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "DataClassification", Value: "Sensitive" },
                ]),
            });
        });
        test("should classify log groups as Internal", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_logs.LogGroup(stack, "TestLogGroup");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Logs::LogGroup", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "DataClassification", Value: "Internal" },
                ]),
            });
        });
        test("should classify S3 buckets as Public by default", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "DataClassification", Value: "Public" },
                ]),
            });
        });
    });
    describe("Additional Custom Tags", () => {
        test("should apply additional custom tags", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
                additionalTags: {
                    Team: "Platform",
                    Application: "WebApp",
                },
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([{ Key: "Team", Value: "Platform" }]),
            });
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([{ Key: "Application", Value: "WebApp" }]),
            });
        });
        test("should work without additional tags", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            // Should still have core tags
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Environment", Value: "Prod" },
                    { Key: "Project", Value: "AIStudio" },
                ]),
            });
        });
    });
    describe("Non-Taggable Resources", () => {
        test("should not fail on non-taggable resources", () => {
            const config = {
                environment: "prod",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            // CloudFormation output is not taggable
            new cdk.CfnOutput(stack, "TestOutput", {
                value: "test-value",
            });
            // Should not throw an error
            expect(() => assertions_1.Template.fromStack(stack)).not.toThrow();
        });
    });
    describe("ManagedBy Tag", () => {
        test("should always set ManagedBy to CDK", () => {
            const config = {
                environment: "dev",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::S3::Bucket", {
                Tags: assertions_1.Match.arrayWith([
                    { Key: "ManagedBy", Value: "CDK" },
                ]),
            });
        });
    });
    describe("DeployedAt Tag", () => {
        test("should set DeployedAt to valid ISO timestamp", () => {
            const config = {
                environment: "dev",
                projectName: "AIStudio",
                owner: "TSD Engineering",
                stackName: "TestStack",
            };
            const aspect = new tagging_aspect_1.TaggingAspect(config);
            cdk.Aspects.of(stack).add(aspect);
            new cdk.aws_s3.Bucket(stack, "TestBucket");
            const template = assertions_1.Template.fromStack(stack);
            const bucketResource = template.findResources("AWS::S3::Bucket");
            const bucket = Object.values(bucketResource)[0];
            const deployedAtTag = bucket.Properties.Tags.find((tag) => tag.Key === "DeployedAt");
            expect(deployedAtTag).toBeDefined();
            expect(deployedAtTag.Value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFnZ2luZy1hc3BlY3QudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRhZ2dpbmctYXNwZWN0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBa0M7QUFDbEMsdURBQXdEO0FBQ3hELDZFQUF1RjtBQUV2RixRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtJQUM3QixJQUFJLEdBQVksQ0FBQTtJQUNoQixJQUFJLEtBQWdCLENBQUE7SUFFcEIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtRQUNuQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUMsQ0FBQTtJQUN6QyxDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDcEMsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtZQUM1RCxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsNkJBQTZCO1lBQzdCLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTtvQkFDNUMsRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7b0JBQ3BDLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO29CQUN2QyxFQUFFLEdBQUcsRUFBRSxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFO29CQUM5QyxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtvQkFDcEMsRUFBRSxHQUFHLEVBQUUsV0FBVyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUU7b0JBQ2xDLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsaUJBQWlCLEVBQUU7b0JBQzFDLEVBQUUsR0FBRyxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFO29CQUNyQyxFQUFFLEdBQUcsRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRTtpQkFDckMsQ0FBQzthQUNILENBQUMsQ0FBQTtZQUVGLG1EQUFtRDtZQUNuRCxNQUFNLFNBQVMsR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLGlCQUFpQixDQUFDLENBQUE7WUFDM0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQTtZQUMxQyxNQUFNLGFBQWEsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEtBQUssWUFBWSxDQUFDLENBQUE7WUFDckYsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFBO1lBQ25DLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUE7UUFDNUQsQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsb0NBQW9DLEVBQUUsR0FBRyxFQUFFO1lBQzlDLE1BQU0sTUFBTSxHQUFrQjtnQkFDNUIsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixLQUFLLEVBQUUsaUJBQWlCO2dCQUN4QixTQUFTLEVBQUUsV0FBVzthQUN2QixDQUFBO1lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSw4QkFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ3hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUVqQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQTtZQUUxQyxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUU7aUJBQ3RDLENBQUM7YUFDSCxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxtQ0FBbUMsRUFBRSxHQUFHLEVBQUU7WUFDN0MsTUFBTSxNQUFNLEdBQWtCO2dCQUM1QixXQUFXLEVBQUUsU0FBUztnQkFDdEIsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLFNBQVMsRUFBRSxXQUFXO2FBQ3ZCLENBQUE7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLDhCQUFhLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDeEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWpDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtpQkFDekMsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO1FBQ3BDLElBQUksQ0FBQyxtREFBbUQsRUFBRSxHQUFHLEVBQUU7WUFDN0QsTUFBTSxNQUFNLEdBQWtCO2dCQUM1QixXQUFXLEVBQUUsTUFBTTtnQkFDbkIsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLFNBQVMsRUFBRSxXQUFXO2FBQ3ZCLENBQUE7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLDhCQUFhLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDeEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWpDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTtpQkFDekMsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEdBQUcsRUFBRTtZQUNoRSxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFFMUMsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxJQUFJLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQ3BCLEVBQUUsR0FBRyxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFO2lCQUN4QyxDQUFDO2FBQ0gsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMsOENBQThDLEVBQUUsR0FBRyxFQUFFO1lBQ3hELE1BQU0sTUFBTSxHQUFrQjtnQkFDNUIsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixLQUFLLEVBQUUsaUJBQWlCO2dCQUN4QixTQUFTLEVBQUUsV0FBVzthQUN2QixDQUFBO1lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSw4QkFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ3hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUVqQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQTtZQUUxQyxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7aUJBQzdDLENBQUM7YUFDSCxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0lBRUYsUUFBUSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUMvQixJQUFJLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO1lBQzVELE1BQU0sTUFBTSxHQUFrQjtnQkFDNUIsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixLQUFLLEVBQUUsaUJBQWlCO2dCQUN4QixTQUFTLEVBQUUsV0FBVzthQUN2QixDQUFBO1lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSw4QkFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ3hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUVqQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQTtZQUUxQyxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ2hELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUU7aUJBQ3pDLENBQUM7YUFDSCxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxrREFBa0QsRUFBRSxHQUFHLEVBQUU7WUFDNUQsTUFBTSxNQUFNLEdBQWtCO2dCQUM1QixXQUFXLEVBQUUsS0FBSztnQkFDbEIsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLFNBQVMsRUFBRSxXQUFXO2FBQ3ZCLENBQUE7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLDhCQUFhLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDeEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWpDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRTtpQkFDckMsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO1FBQ25DLElBQUksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7WUFDM0QsTUFBTSxNQUFNLEdBQWtCO2dCQUM1QixXQUFXLEVBQUUsTUFBTTtnQkFDbkIsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLFNBQVMsRUFBRSxXQUFXO2FBQ3ZCLENBQUE7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLDhCQUFhLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDeEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWpDLGlFQUFpRTtZQUNqRSxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxjQUFjLEVBQUU7Z0JBQ3JELE1BQU0sRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQztvQkFDdkQsT0FBTyxFQUFFLEdBQUcsQ0FBQyxPQUFPLENBQUMsMkJBQTJCLENBQUMsUUFBUTtpQkFDMUQsQ0FBQztnQkFDRixNQUFNLEVBQUUsR0FBRyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQztnQkFDMUQsR0FBRyxFQUFFLElBQUksR0FBRyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQzthQUMzQyxDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMscUJBQXFCLEVBQUU7Z0JBQ3BELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRTtpQkFDbEQsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEdBQUcsRUFBRTtZQUNoRCxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsSUFBSSxHQUFHLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQTtZQUV0RCxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxRQUFRLENBQUMscUJBQXFCLENBQUMsNkJBQTZCLEVBQUU7Z0JBQzVELElBQUksRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQztvQkFDcEIsRUFBRSxHQUFHLEVBQUUsb0JBQW9CLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRTtpQkFDbEQsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO1FBRUYsSUFBSSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtZQUNsRCxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLENBQUE7WUFFaEQsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHFCQUFxQixFQUFFO2dCQUNwRCxJQUFJLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQ3BCLEVBQUUsR0FBRyxFQUFFLG9CQUFvQixFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUU7aUJBQ2pELENBQUM7YUFDSCxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtRQUVGLElBQUksQ0FBQyxpREFBaUQsRUFBRSxHQUFHLEVBQUU7WUFDM0QsTUFBTSxNQUFNLEdBQWtCO2dCQUM1QixXQUFXLEVBQUUsTUFBTTtnQkFDbkIsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLFNBQVMsRUFBRSxXQUFXO2FBQ3ZCLENBQUE7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLDhCQUFhLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDeEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWpDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDaEQsSUFBSSxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNwQixFQUFFLEdBQUcsRUFBRSxvQkFBb0IsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFO2lCQUMvQyxDQUFDO2FBQ0gsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7UUFDdEMsSUFBSSxDQUFDLHFDQUFxQyxFQUFFLEdBQUcsRUFBRTtZQUMvQyxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7Z0JBQ3RCLGNBQWMsRUFBRTtvQkFDZCxJQUFJLEVBQUUsVUFBVTtvQkFDaEIsV0FBVyxFQUFFLFFBQVE7aUJBQ3RCO2FBQ0YsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFFMUMsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxJQUFJLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRSxDQUFDLENBQUM7YUFDNUQsQ0FBQyxDQUFBO1lBQ0YsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxJQUFJLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxhQUFhLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7YUFDakUsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7UUFFRixJQUFJLENBQUMscUNBQXFDLEVBQUUsR0FBRyxFQUFFO1lBQy9DLE1BQU0sTUFBTSxHQUFrQjtnQkFDNUIsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLFdBQVcsRUFBRSxVQUFVO2dCQUN2QixLQUFLLEVBQUUsaUJBQWlCO2dCQUN4QixTQUFTLEVBQUUsV0FBVzthQUN2QixDQUFBO1lBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSw4QkFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBQ3hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUVqQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxZQUFZLENBQUMsQ0FBQTtZQUUxQyxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyw4QkFBOEI7WUFDOUIsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxJQUFJLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQ3BCLEVBQUUsR0FBRyxFQUFFLGFBQWEsRUFBRSxLQUFLLEVBQUUsTUFBTSxFQUFFO29CQUNyQyxFQUFFLEdBQUcsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFVBQVUsRUFBRTtpQkFDdEMsQ0FBQzthQUNILENBQUMsQ0FBQTtRQUNKLENBQUMsQ0FBQyxDQUFBO0lBQ0osQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLElBQUksQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7WUFDckQsTUFBTSxNQUFNLEdBQWtCO2dCQUM1QixXQUFXLEVBQUUsTUFBTTtnQkFDbkIsV0FBVyxFQUFFLFVBQVU7Z0JBQ3ZCLEtBQUssRUFBRSxpQkFBaUI7Z0JBQ3hCLFNBQVMsRUFBRSxXQUFXO2FBQ3ZCLENBQUE7WUFFRCxNQUFNLE1BQU0sR0FBRyxJQUFJLDhCQUFhLENBQUMsTUFBTSxDQUFDLENBQUE7WUFDeEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWpDLHdDQUF3QztZQUN4QyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLFlBQVksRUFBRTtnQkFDckMsS0FBSyxFQUFFLFlBQVk7YUFDcEIsQ0FBQyxDQUFBO1lBRUYsNEJBQTRCO1lBQzVCLE1BQU0sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQTtRQUN2RCxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0lBRUYsUUFBUSxDQUFDLGVBQWUsRUFBRSxHQUFHLEVBQUU7UUFDN0IsSUFBSSxDQUFDLG9DQUFvQyxFQUFFLEdBQUcsRUFBRTtZQUM5QyxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFFMUMsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO2dCQUNoRCxJQUFJLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQ3BCLEVBQUUsR0FBRyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFO2lCQUNuQyxDQUFDO2FBQ0gsQ0FBQyxDQUFBO1FBQ0osQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxHQUFHLEVBQUU7UUFDOUIsSUFBSSxDQUFDLDhDQUE4QyxFQUFFLEdBQUcsRUFBRTtZQUN4RCxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUE7WUFFMUMsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFDMUMsTUFBTSxjQUFjLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFBO1lBQ2hFLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUE7WUFDL0MsTUFBTSxhQUFhLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUMvQyxDQUFDLEdBQVEsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsS0FBSyxZQUFZLENBQ3ZDLENBQUE7WUFFRCxNQUFNLENBQUMsYUFBYSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUE7WUFDbkMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMscUJBQXFCLENBQUMsQ0FBQTtRQUM1RCxDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQyxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCJcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCJcbmltcG9ydCB7IFRhZ2dpbmdBc3BlY3QsIFRhZ2dpbmdDb25maWcgfSBmcm9tIFwiLi4vLi4vbGliL2NvbnN0cnVjdHMvYmFzZS90YWdnaW5nLWFzcGVjdFwiXG5cbmRlc2NyaWJlKFwiVGFnZ2luZ0FzcGVjdFwiLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHBcbiAgbGV0IHN0YWNrOiBjZGsuU3RhY2tcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpXG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIilcbiAgfSlcblxuICBkZXNjcmliZShcIkNvcmUgVGFnIEFwcGxpY2F0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIGFwcGx5IGFsbCBjb3JlIHRhZ3MgdG8gdGFnZ2FibGUgcmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICAvLyBDcmVhdGUgYSB0YWdnYWJsZSByZXNvdXJjZVxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiQnVzaW5lc3NVbml0XCIsIFZhbHVlOiBcIlRlY2hub2xvZ3lcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIkNvbXBsaWFuY2VcIiwgVmFsdWU6IFwiTm9uZVwiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiQ29zdENlbnRlclwiLCBWYWx1ZTogXCJERVYtMDAxXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJEYXRhQ2xhc3NpZmljYXRpb25cIiwgVmFsdWU6IFwiUHVibGljXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJEZXZcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIk1hbmFnZWRCeVwiLCBWYWx1ZTogXCJDREtcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIk93bmVyXCIsIFZhbHVlOiBcIlRTRCBFbmdpbmVlcmluZ1wiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiUHJvamVjdFwiLCBWYWx1ZTogXCJBSVN0dWRpb1wiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiU3RhY2tcIiwgVmFsdWU6IFwiVGVzdFN0YWNrXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuXG4gICAgICAvLyBBbHNvIHZlcmlmeSBEZXBsb3llZEF0IGV4aXN0cyAodmFsdWUgaXMgZHluYW1pYylcbiAgICAgIGNvbnN0IHJlc291cmNlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OlMzOjpCdWNrZXRcIilcbiAgICAgIGNvbnN0IGJ1Y2tldCA9IE9iamVjdC52YWx1ZXMocmVzb3VyY2VzKVswXVxuICAgICAgY29uc3QgZGVwbG95ZWRBdFRhZyA9IGJ1Y2tldC5Qcm9wZXJ0aWVzLlRhZ3MuZmluZCgodDogYW55KSA9PiB0LktleSA9PT0gXCJEZXBsb3llZEF0XCIpXG4gICAgICBleHBlY3QoZGVwbG95ZWRBdFRhZykudG9CZURlZmluZWQoKVxuICAgICAgZXhwZWN0KGRlcGxveWVkQXRUYWcuVmFsdWUpLnRvTWF0Y2goL15cXGR7NH0tXFxkezJ9LVxcZHsyfVQvKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNhcGl0YWxpemUgZW52aXJvbm1lbnQgbmFtZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkVudmlyb25tZW50XCIsIFZhbHVlOiBcIlByb2RcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgaGFuZGxlIHN0YWdpbmcgZW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJzdGFnaW5nXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJTdGFnaW5nXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJDb3N0IEFsbG9jYXRpb24gVGFnc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBzZXQgY29zdCBjZW50ZXIgdG8gUFJPRC0wMDEgZm9yIHByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJDb3N0Q2VudGVyXCIsIFZhbHVlOiBcIlBST0QtMDAxXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIHNldCBjb3N0IGNlbnRlciB0byBERVYtMDAxIGZvciBub24tcHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiQ29zdENlbnRlclwiLCBWYWx1ZTogXCJERVYtMDAxXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGFsd2F5cyBzZXQgQnVzaW5lc3NVbml0IHRvIFRlY2hub2xvZ3lcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJCdXNpbmVzc1VuaXRcIiwgVmFsdWU6IFwiVGVjaG5vbG9neVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQ29tcGxpYW5jZSBUYWdzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIHNldCBjb21wbGlhbmNlIHRvIFJlcXVpcmVkIGZvciBwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiQ29tcGxpYW5jZVwiLCBWYWx1ZTogXCJSZXF1aXJlZFwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBzZXQgY29tcGxpYW5jZSB0byBOb25lIGZvciBub24tcHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiQ29tcGxpYW5jZVwiLCBWYWx1ZTogXCJOb25lXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJEYXRhIENsYXNzaWZpY2F0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIGNsYXNzaWZ5IGRhdGFiYXNlIHJlc291cmNlcyBhcyBTZW5zaXRpdmVcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICAvLyBDcmVhdGUgYSBkYXRhYmFzZSBjbHVzdGVyIChoYXMgXCJEYXRhYmFzZVwiIGluIGNvbnN0cnVjdG9yIG5hbWUpXG4gICAgICBuZXcgY2RrLmF3c19yZHMuRGF0YWJhc2VDbHVzdGVyKHN0YWNrLCBcIlRlc3REYXRhYmFzZVwiLCB7XG4gICAgICAgIGVuZ2luZTogY2RrLmF3c19yZHMuRGF0YWJhc2VDbHVzdGVyRW5naW5lLmF1cm9yYVBvc3RncmVzKHtcbiAgICAgICAgICB2ZXJzaW9uOiBjZGsuYXdzX3Jkcy5BdXJvcmFQb3N0Z3Jlc0VuZ2luZVZlcnNpb24uVkVSXzE2XzgsXG4gICAgICAgIH0pLFxuICAgICAgICB3cml0ZXI6IGNkay5hd3NfcmRzLkNsdXN0ZXJJbnN0YW5jZS5zZXJ2ZXJsZXNzVjIoXCJ3cml0ZXJcIiksXG4gICAgICAgIHZwYzogbmV3IGNkay5hd3NfZWMyLlZwYyhzdGFjaywgXCJUZXN0VnBjXCIpLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UkRTOjpEQkNsdXN0ZXJcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkRhdGFDbGFzc2lmaWNhdGlvblwiLCBWYWx1ZTogXCJTZW5zaXRpdmVcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgY2xhc3NpZnkgc2VjcmV0cyBhcyBTZW5zaXRpdmVcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zZWNyZXRzbWFuYWdlci5TZWNyZXQoc3RhY2ssIFwiVGVzdFNlY3JldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTZWNyZXRzTWFuYWdlcjo6U2VjcmV0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJEYXRhQ2xhc3NpZmljYXRpb25cIiwgVmFsdWU6IFwiU2Vuc2l0aXZlXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNsYXNzaWZ5IGxvZyBncm91cHMgYXMgSW50ZXJuYWxcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19sb2dzLkxvZ0dyb3VwKHN0YWNrLCBcIlRlc3RMb2dHcm91cFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMb2dzOjpMb2dHcm91cFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiRGF0YUNsYXNzaWZpY2F0aW9uXCIsIFZhbHVlOiBcIkludGVybmFsXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNsYXNzaWZ5IFMzIGJ1Y2tldHMgYXMgUHVibGljIGJ5IGRlZmF1bHRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJEYXRhQ2xhc3NpZmljYXRpb25cIiwgVmFsdWU6IFwiUHVibGljXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJBZGRpdGlvbmFsIEN1c3RvbSBUYWdzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIGFwcGx5IGFkZGl0aW9uYWwgY3VzdG9tIHRhZ3NcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICAgIGFkZGl0aW9uYWxUYWdzOiB7XG4gICAgICAgICAgVGVhbTogXCJQbGF0Zm9ybVwiLFxuICAgICAgICAgIEFwcGxpY2F0aW9uOiBcIldlYkFwcFwiLFxuICAgICAgICB9LFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbeyBLZXk6IFwiVGVhbVwiLCBWYWx1ZTogXCJQbGF0Zm9ybVwiIH1dKSxcbiAgICAgIH0pXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW3sgS2V5OiBcIkFwcGxpY2F0aW9uXCIsIFZhbHVlOiBcIldlYkFwcFwiIH1dKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgd29yayB3aXRob3V0IGFkZGl0aW9uYWwgdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICAvLyBTaG91bGQgc3RpbGwgaGF2ZSBjb3JlIHRhZ3NcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiRW52aXJvbm1lbnRcIiwgVmFsdWU6IFwiUHJvZFwiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiUHJvamVjdFwiLCBWYWx1ZTogXCJBSVN0dWRpb1wiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiTm9uLVRhZ2dhYmxlIFJlc291cmNlc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBub3QgZmFpbCBvbiBub24tdGFnZ2FibGUgcmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgLy8gQ2xvdWRGb3JtYXRpb24gb3V0cHV0IGlzIG5vdCB0YWdnYWJsZVxuICAgICAgbmV3IGNkay5DZm5PdXRwdXQoc3RhY2ssIFwiVGVzdE91dHB1dFwiLCB7XG4gICAgICAgIHZhbHVlOiBcInRlc3QtdmFsdWVcIixcbiAgICAgIH0pXG5cbiAgICAgIC8vIFNob3VsZCBub3QgdGhyb3cgYW4gZXJyb3JcbiAgICAgIGV4cGVjdCgoKSA9PiBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spKS5ub3QudG9UaHJvdygpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIk1hbmFnZWRCeSBUYWdcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgYWx3YXlzIHNldCBNYW5hZ2VkQnkgdG8gQ0RLXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJNYW5hZ2VkQnlcIiwgVmFsdWU6IFwiQ0RLXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJEZXBsb3llZEF0IFRhZ1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBzZXQgRGVwbG95ZWRBdCB0byB2YWxpZCBJU08gdGltZXN0YW1wXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIGNvbnN0IGJ1Y2tldFJlc291cmNlID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6UzM6OkJ1Y2tldFwiKVxuICAgICAgY29uc3QgYnVja2V0ID0gT2JqZWN0LnZhbHVlcyhidWNrZXRSZXNvdXJjZSlbMF1cbiAgICAgIGNvbnN0IGRlcGxveWVkQXRUYWcgPSBidWNrZXQuUHJvcGVydGllcy5UYWdzLmZpbmQoXG4gICAgICAgICh0YWc6IGFueSkgPT4gdGFnLktleSA9PT0gXCJEZXBsb3llZEF0XCJcbiAgICAgIClcblxuICAgICAgZXhwZWN0KGRlcGxveWVkQXRUYWcpLnRvQmVEZWZpbmVkKClcbiAgICAgIGV4cGVjdChkZXBsb3llZEF0VGFnLlZhbHVlKS50b01hdGNoKC9eXFxkezR9LVxcZHsyfS1cXGR7Mn1ULylcbiAgICB9KVxuICB9KVxufSlcbiJdfQ==