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
                Tags: assertions_1.Match.arrayWith([
                    { Key: "Team", Value: "Platform" },
                    { Key: "Application", Value: "WebApp" },
                ]),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFnZ2luZy1hc3BlY3QudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRhZ2dpbmctYXNwZWN0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBa0M7QUFDbEMsdURBQXdEO0FBQ3hELDZFQUF1RjtBQUV2RixRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtJQUM3QixJQUFJLEdBQVksQ0FBQTtJQUNoQixJQUFJLEtBQWdCLENBQUE7SUFFcEIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtRQUNuQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUMsQ0FBQTtJQUN6QyxDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDcEMsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtZQUM1RCxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsNkJBQTZCO1lBQzdCLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFB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eEMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1lBRWpDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBQzFDLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQTtZQUNoRSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFBO1lBQy9DLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FDL0MsQ0FBQyxHQUFRLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssWUFBWSxDQUN2QyxDQUFBO1lBRUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFBO1lBQ25DLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUE7UUFDNUQsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtBQUNKLENBQUMsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiXG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiXG5pbXBvcnQgeyBUYWdnaW5nQXNwZWN0LCBUYWdnaW5nQ29uZmlnIH0gZnJvbSBcIi4uLy4uL2xpYi9jb25zdHJ1Y3RzL2Jhc2UvdGFnZ2luZy1hc3BlY3RcIlxuXG5kZXNjcmliZShcIlRhZ2dpbmdBc3BlY3RcIiwgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwXG4gIGxldCBzdGFjazogY2RrLlN0YWNrXG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgYXBwID0gbmV3IGNkay5BcHAoKVxuICAgIHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsIFwiVGVzdFN0YWNrXCIpXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJDb3JlIFRhZyBBcHBsaWNhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBhcHBseSBhbGwgY29yZSB0YWdzIHRvIHRhZ2dhYmxlIHJlc291cmNlc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgLy8gQ3JlYXRlIGEgdGFnZ2FibGUgcmVzb3VyY2VcbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkJ1c2luZXNzVW5pdFwiLCBWYWx1ZTogXCJUZWNobm9sb2d5XCIgfSxcbiAgICAgICAgICB7IEtleTogXCJDb21wbGlhbmNlXCIsIFZhbHVlOiBcIk5vbmVcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIkNvc3RDZW50ZXJcIiwgVmFsdWU6IFwiREVWLTAwMVwiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiRGF0YUNsYXNzaWZpY2F0aW9uXCIsIFZhbHVlOiBcIlB1YmxpY1wiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiRW52aXJvbm1lbnRcIiwgVmFsdWU6IFwiRGV2XCIgfSxcbiAgICAgICAgICB7IEtleTogXCJNYW5hZ2VkQnlcIiwgVmFsdWU6IFwiQ0RLXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJPd25lclwiLCBWYWx1ZTogXCJUU0QgRW5naW5lZXJpbmdcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIlByb2plY3RcIiwgVmFsdWU6IFwiQUlTdHVkaW9cIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIlN0YWNrXCIsIFZhbHVlOiBcIlRlc3RTdGFja1wiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcblxuICAgICAgLy8gQWxzbyB2ZXJpZnkgRGVwbG95ZWRBdCBleGlzdHMgKHZhbHVlIGlzIGR5bmFtaWMpXG4gICAgICBjb25zdCByZXNvdXJjZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTMzo6QnVja2V0XCIpXG4gICAgICBjb25zdCBidWNrZXQgPSBPYmplY3QudmFsdWVzKHJlc291cmNlcylbMF1cbiAgICAgIGNvbnN0IGRlcGxveWVkQXRUYWcgPSBidWNrZXQuUHJvcGVydGllcy5UYWdzLmZpbmQoKHQ6IGFueSkgPT4gdC5LZXkgPT09IFwiRGVwbG95ZWRBdFwiKVxuICAgICAgZXhwZWN0KGRlcGxveWVkQXRUYWcpLnRvQmVEZWZpbmVkKClcbiAgICAgIGV4cGVjdChkZXBsb3llZEF0VGFnLlZhbHVlKS50b01hdGNoKC9eXFxkezR9LVxcZHsyfS1cXGR7Mn1ULylcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjYXBpdGFsaXplIGVudmlyb25tZW50IG5hbWVcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJQcm9kXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhbmRsZSBzdGFnaW5nIGVudmlyb25tZW50XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwic3RhZ2luZ1wiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiRW52aXJvbm1lbnRcIiwgVmFsdWU6IFwiU3RhZ2luZ1wiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQ29zdCBBbGxvY2F0aW9uIFRhZ3NcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgc2V0IGNvc3QgY2VudGVyIHRvIFBST0QtMDAxIGZvciBwcm9kdWN0aW9uXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiQ29zdENlbnRlclwiLCBWYWx1ZTogXCJQUk9ELTAwMVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBzZXQgY29zdCBjZW50ZXIgdG8gREVWLTAwMSBmb3Igbm9uLXByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkNvc3RDZW50ZXJcIiwgVmFsdWU6IFwiREVWLTAwMVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBhbHdheXMgc2V0IEJ1c2luZXNzVW5pdCB0byBUZWNobm9sb2d5XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiQnVzaW5lc3NVbml0XCIsIFZhbHVlOiBcIlRlY2hub2xvZ3lcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkNvbXBsaWFuY2UgVGFnc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBzZXQgY29tcGxpYW5jZSB0byBSZXF1aXJlZCBmb3IgcHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkNvbXBsaWFuY2VcIiwgVmFsdWU6IFwiUmVxdWlyZWRcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJzaG91bGQgc2V0IGNvbXBsaWFuY2UgdG8gTm9uZSBmb3Igbm9uLXByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkNvbXBsaWFuY2VcIiwgVmFsdWU6IFwiTm9uZVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiRGF0YSBDbGFzc2lmaWNhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBjbGFzc2lmeSBkYXRhYmFzZSByZXNvdXJjZXMgYXMgU2Vuc2l0aXZlXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgLy8gQ3JlYXRlIGEgZGF0YWJhc2UgY2x1c3RlciAoaGFzIFwiRGF0YWJhc2VcIiBpbiBjb25zdHJ1Y3RvciBuYW1lKVxuICAgICAgbmV3IGNkay5hd3NfcmRzLkRhdGFiYXNlQ2x1c3RlcihzdGFjaywgXCJUZXN0RGF0YWJhc2VcIiwge1xuICAgICAgICBlbmdpbmU6IGNkay5hd3NfcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgICAgdmVyc2lvbjogY2RrLmF3c19yZHMuQXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xNl84LFxuICAgICAgICB9KSxcbiAgICAgICAgd3JpdGVyOiBjZGsuYXdzX3Jkcy5DbHVzdGVySW5zdGFuY2Uuc2VydmVybGVzc1YyKFwid3JpdGVyXCIpLFxuICAgICAgICB2cGM6IG5ldyBjZGsuYXdzX2VjMi5WcGMoc3RhY2ssIFwiVGVzdFZwY1wiKSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlJEUzo6REJDbHVzdGVyXCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJEYXRhQ2xhc3NpZmljYXRpb25cIiwgVmFsdWU6IFwiU2Vuc2l0aXZlXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNsYXNzaWZ5IHNlY3JldHMgYXMgU2Vuc2l0aXZlXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3Nfc2VjcmV0c21hbmFnZXIuU2VjcmV0KHN0YWNrLCBcIlRlc3RTZWNyZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6U2VjcmV0c01hbmFnZXI6OlNlY3JldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiRGF0YUNsYXNzaWZpY2F0aW9uXCIsIFZhbHVlOiBcIlNlbnNpdGl2ZVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjbGFzc2lmeSBsb2cgZ3JvdXBzIGFzIEludGVybmFsXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfbG9ncy5Mb2dHcm91cChzdGFjaywgXCJUZXN0TG9nR3JvdXBcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TG9nczo6TG9nR3JvdXBcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIkRhdGFDbGFzc2lmaWNhdGlvblwiLCBWYWx1ZTogXCJJbnRlcm5hbFwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjbGFzc2lmeSBTMyBidWNrZXRzIGFzIFB1YmxpYyBieSBkZWZhdWx0XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgeyBLZXk6IFwiRGF0YUNsYXNzaWZpY2F0aW9uXCIsIFZhbHVlOiBcIlB1YmxpY1wiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQWRkaXRpb25hbCBDdXN0b20gVGFnc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBhcHBseSBhZGRpdGlvbmFsIGN1c3RvbSB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgICBhZGRpdGlvbmFsVGFnczoge1xuICAgICAgICAgIFRlYW06IFwiUGxhdGZvcm1cIixcbiAgICAgICAgICBBcHBsaWNhdGlvbjogXCJXZWJBcHBcIixcbiAgICAgICAgfSxcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIlRlYW1cIiwgVmFsdWU6IFwiUGxhdGZvcm1cIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIkFwcGxpY2F0aW9uXCIsIFZhbHVlOiBcIldlYkFwcFwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCB3b3JrIHdpdGhvdXQgYWRkaXRpb25hbCB0YWdzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIFNob3VsZCBzdGlsbCBoYXZlIGNvcmUgdGFnc1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJQcm9kXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJQcm9qZWN0XCIsIFZhbHVlOiBcIkFJU3R1ZGlvXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJOb24tVGFnZ2FibGUgUmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIG5vdCBmYWlsIG9uIG5vbi10YWdnYWJsZSByZXNvdXJjZXNcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICAvLyBDbG91ZEZvcm1hdGlvbiBvdXRwdXQgaXMgbm90IHRhZ2dhYmxlXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgXCJUZXN0T3V0cHV0XCIsIHtcbiAgICAgICAgdmFsdWU6IFwidGVzdC12YWx1ZVwiLFxuICAgICAgfSlcblxuICAgICAgLy8gU2hvdWxkIG5vdCB0aHJvdyBhbiBlcnJvclxuICAgICAgZXhwZWN0KCgpID0+IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaykpLm5vdC50b1Rocm93KClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiTWFuYWdlZEJ5IFRhZ1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBhbHdheXMgc2V0IE1hbmFnZWRCeSB0byBDREtcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIHsgS2V5OiBcIk1hbmFnZWRCeVwiLCBWYWx1ZTogXCJDREtcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkRlcGxveWVkQXQgVGFnXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIHNldCBEZXBsb3llZEF0IHRvIHZhbGlkIElTTyB0aW1lc3RhbXBcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuICAgICAgY29uc3QgYnVja2V0UmVzb3VyY2UgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTMzo6QnVja2V0XCIpXG4gICAgICBjb25zdCBidWNrZXQgPSBPYmplY3QudmFsdWVzKGJ1Y2tldFJlc291cmNlKVswXVxuICAgICAgY29uc3QgZGVwbG95ZWRBdFRhZyA9IGJ1Y2tldC5Qcm9wZXJ0aWVzLlRhZ3MuZmluZChcbiAgICAgICAgKHRhZzogYW55KSA9PiB0YWcuS2V5ID09PSBcIkRlcGxveWVkQXRcIlxuICAgICAgKVxuXG4gICAgICBleHBlY3QoZGVwbG95ZWRBdFRhZykudG9CZURlZmluZWQoKVxuICAgICAgZXhwZWN0KGRlcGxveWVkQXRUYWcuVmFsdWUpLnRvTWF0Y2goL15cXGR7NH0tXFxkezJ9LVxcZHsyfVQvKVxuICAgIH0pXG4gIH0pXG59KVxuIl19