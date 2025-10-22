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
                Tags: [
                    { Key: "BusinessUnit", Value: "Technology" },
                    { Key: "Compliance", Value: "None" },
                    { Key: "CostCenter", Value: "DEV-001" },
                    { Key: "DataClassification", Value: "Public" },
                    { Key: "Environment", Value: "Dev" },
                    { Key: "ManagedBy", Value: "CDK" },
                    { Key: "Owner", Value: "TSD Engineering" },
                    { Key: "Project", Value: "AIStudio" },
                    { Key: "Stack", Value: "TestStack" },
                    // DeployedAt is dynamic, so we just verify it exists
                    { Key: "DeployedAt", Value: expect.any(String) },
                ],
            });
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
                Tags: expect.arrayContaining([
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFnZ2luZy1hc3BlY3QudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInRhZ2dpbmctYXNwZWN0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBa0M7QUFDbEMsdURBQWlEO0FBQ2pELDZFQUF1RjtBQUV2RixRQUFRLENBQUMsZUFBZSxFQUFFLEdBQUcsRUFBRTtJQUM3QixJQUFJLEdBQVksQ0FBQTtJQUNoQixJQUFJLEtBQWdCLENBQUE7SUFFcEIsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtRQUNuQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUMsQ0FBQTtJQUN6QyxDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSxHQUFHLEVBQUU7UUFDcEMsSUFBSSxDQUFDLGtEQUFrRCxFQUFFLEdBQUcsRUFBRTtZQUM1RCxNQUFNLE1BQU0sR0FBa0I7Z0JBQzVCLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixXQUFXLEVBQUUsVUFBVTtnQkFDdkIsS0FBSyxFQUFFLGlCQUFpQjtnQkFDeEIsU0FBUyxFQUFFLFdBQVc7YUFDdkIsQ0FBQTtZQUVELE1BQU0sTUFBTSxHQUFHLElBQUksOEJBQWEsQ0FBQyxNQUFNLENBQUMsQ0FBQTtZQUN4QyxHQUFHLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUE7WUFFakMsNkJBQTZCO1lBQzdCLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFBO1lBRTFDLE1BQU0sUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFBO1lBRTFDLFFB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Qy9DLE1BQU0sYUFBYSxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FDL0MsQ0FBQyxHQUFRLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUssWUFBWSxDQUN2QyxDQUFBO1lBRUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFBO1lBQ25DLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLENBQUE7UUFDNUQsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtBQUNKLENBQUMsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiXG5pbXBvcnQgeyBUZW1wbGF0ZSB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCJcbmltcG9ydCB7IFRhZ2dpbmdBc3BlY3QsIFRhZ2dpbmdDb25maWcgfSBmcm9tIFwiLi4vLi4vbGliL2NvbnN0cnVjdHMvYmFzZS90YWdnaW5nLWFzcGVjdFwiXG5cbmRlc2NyaWJlKFwiVGFnZ2luZ0FzcGVjdFwiLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHBcbiAgbGV0IHN0YWNrOiBjZGsuU3RhY2tcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpXG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIilcbiAgfSlcblxuICBkZXNjcmliZShcIkNvcmUgVGFnIEFwcGxpY2F0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIGFwcGx5IGFsbCBjb3JlIHRhZ3MgdG8gdGFnZ2FibGUgcmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICAvLyBDcmVhdGUgYSB0YWdnYWJsZSByZXNvdXJjZVxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IFtcbiAgICAgICAgICB7IEtleTogXCJCdXNpbmVzc1VuaXRcIiwgVmFsdWU6IFwiVGVjaG5vbG9neVwiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiQ29tcGxpYW5jZVwiLCBWYWx1ZTogXCJOb25lXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJDb3N0Q2VudGVyXCIsIFZhbHVlOiBcIkRFVi0wMDFcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIkRhdGFDbGFzc2lmaWNhdGlvblwiLCBWYWx1ZTogXCJQdWJsaWNcIiB9LFxuICAgICAgICAgIHsgS2V5OiBcIkVudmlyb25tZW50XCIsIFZhbHVlOiBcIkRldlwiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiTWFuYWdlZEJ5XCIsIFZhbHVlOiBcIkNES1wiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiT3duZXJcIiwgVmFsdWU6IFwiVFNEIEVuZ2luZWVyaW5nXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJQcm9qZWN0XCIsIFZhbHVlOiBcIkFJU3R1ZGlvXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJTdGFja1wiLCBWYWx1ZTogXCJUZXN0U3RhY2tcIiB9LFxuICAgICAgICAgIC8vIERlcGxveWVkQXQgaXMgZHluYW1pYywgc28gd2UganVzdCB2ZXJpZnkgaXQgZXhpc3RzXG4gICAgICAgICAgeyBLZXk6IFwiRGVwbG95ZWRBdFwiLCBWYWx1ZTogZXhwZWN0LmFueShTdHJpbmcpIH0sXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNhcGl0YWxpemUgZW52aXJvbm1lbnQgbmFtZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBleHBlY3QuYXJyYXlDb250YWluaW5nKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJQcm9kXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGhhbmRsZSBzdGFnaW5nIGVudmlyb25tZW50XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwic3RhZ2luZ1wiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIHsgS2V5OiBcIkVudmlyb25tZW50XCIsIFZhbHVlOiBcIlN0YWdpbmdcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkNvc3QgQWxsb2NhdGlvbiBUYWdzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIHNldCBjb3N0IGNlbnRlciB0byBQUk9ELTAwMSBmb3IgcHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBleHBlY3QuYXJyYXlDb250YWluaW5nKFtcbiAgICAgICAgICB7IEtleTogXCJDb3N0Q2VudGVyXCIsIFZhbHVlOiBcIlBST0QtMDAxXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIHNldCBjb3N0IGNlbnRlciB0byBERVYtMDAxIGZvciBub24tcHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIHsgS2V5OiBcIkNvc3RDZW50ZXJcIiwgVmFsdWU6IFwiREVWLTAwMVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBhbHdheXMgc2V0IEJ1c2luZXNzVW5pdCB0byBUZWNobm9sb2d5XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIHsgS2V5OiBcIkJ1c2luZXNzVW5pdFwiLCBWYWx1ZTogXCJUZWNobm9sb2d5XCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJDb21wbGlhbmNlIFRhZ3NcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgc2V0IGNvbXBsaWFuY2UgdG8gUmVxdWlyZWQgZm9yIHByb2R1Y3Rpb25cIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogZXhwZWN0LmFycmF5Q29udGFpbmluZyhbXG4gICAgICAgICAgeyBLZXk6IFwiQ29tcGxpYW5jZVwiLCBWYWx1ZTogXCJSZXF1aXJlZFwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBzZXQgY29tcGxpYW5jZSB0byBOb25lIGZvciBub24tcHJvZHVjdGlvblwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIHsgS2V5OiBcIkNvbXBsaWFuY2VcIiwgVmFsdWU6IFwiTm9uZVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiRGF0YSBDbGFzc2lmaWNhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBjbGFzc2lmeSBkYXRhYmFzZSByZXNvdXJjZXMgYXMgU2Vuc2l0aXZlXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgLy8gQ3JlYXRlIGEgZGF0YWJhc2UgY2x1c3RlciAoaGFzIFwiRGF0YWJhc2VcIiBpbiBjb25zdHJ1Y3RvciBuYW1lKVxuICAgICAgbmV3IGNkay5hd3NfcmRzLkRhdGFiYXNlQ2x1c3RlcihzdGFjaywgXCJUZXN0RGF0YWJhc2VcIiwge1xuICAgICAgICBlbmdpbmU6IGNkay5hd3NfcmRzLkRhdGFiYXNlQ2x1c3RlckVuZ2luZS5hdXJvcmFQb3N0Z3Jlcyh7XG4gICAgICAgICAgdmVyc2lvbjogY2RrLmF3c19yZHMuQXVyb3JhUG9zdGdyZXNFbmdpbmVWZXJzaW9uLlZFUl8xNl84LFxuICAgICAgICB9KSxcbiAgICAgICAgd3JpdGVyOiBjZGsuYXdzX3Jkcy5DbHVzdGVySW5zdGFuY2Uuc2VydmVybGVzc1YyKFwid3JpdGVyXCIpLFxuICAgICAgICB2cGM6IG5ldyBjZGsuYXdzX2VjMi5WcGMoc3RhY2ssIFwiVGVzdFZwY1wiKSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlJEUzo6REJDbHVzdGVyXCIsIHtcbiAgICAgICAgVGFnczogZXhwZWN0LmFycmF5Q29udGFpbmluZyhbXG4gICAgICAgICAgeyBLZXk6IFwiRGF0YUNsYXNzaWZpY2F0aW9uXCIsIFZhbHVlOiBcIlNlbnNpdGl2ZVwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjbGFzc2lmeSBzZWNyZXRzIGFzIFNlbnNpdGl2ZVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3NlY3JldHNtYW5hZ2VyLlNlY3JldChzdGFjaywgXCJUZXN0U2VjcmV0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlNlY3JldHNNYW5hZ2VyOjpTZWNyZXRcIiwge1xuICAgICAgICBUYWdzOiBleHBlY3QuYXJyYXlDb250YWluaW5nKFtcbiAgICAgICAgICB7IEtleTogXCJEYXRhQ2xhc3NpZmljYXRpb25cIiwgVmFsdWU6IFwiU2Vuc2l0aXZlXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIGNsYXNzaWZ5IGxvZyBncm91cHMgYXMgSW50ZXJuYWxcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19sb2dzLkxvZ0dyb3VwKHN0YWNrLCBcIlRlc3RMb2dHcm91cFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMb2dzOjpMb2dHcm91cFwiLCB7XG4gICAgICAgIFRhZ3M6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIHsgS2V5OiBcIkRhdGFDbGFzc2lmaWNhdGlvblwiLCBWYWx1ZTogXCJJbnRlcm5hbFwiIH0sXG4gICAgICAgIF0pLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3VsZCBjbGFzc2lmeSBTMyBidWNrZXRzIGFzIFB1YmxpYyBieSBkZWZhdWx0XCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwicHJvZFwiLFxuICAgICAgICBwcm9qZWN0TmFtZTogXCJBSVN0dWRpb1wiLFxuICAgICAgICBvd25lcjogXCJUU0QgRW5naW5lZXJpbmdcIixcbiAgICAgICAgc3RhY2tOYW1lOiBcIlRlc3RTdGFja1wiLFxuICAgICAgfVxuXG4gICAgICBjb25zdCBhc3BlY3QgPSBuZXcgVGFnZ2luZ0FzcGVjdChjb25maWcpXG4gICAgICBjZGsuQXNwZWN0cy5vZihzdGFjaykuYWRkKGFzcGVjdClcblxuICAgICAgbmV3IGNkay5hd3NfczMuQnVja2V0KHN0YWNrLCBcIlRlc3RCdWNrZXRcIilcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICAgIFRhZ3M6IGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIHsgS2V5OiBcIkRhdGFDbGFzc2lmaWNhdGlvblwiLCBWYWx1ZTogXCJQdWJsaWNcIiB9LFxuICAgICAgICBdKSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkFkZGl0aW9uYWwgQ3VzdG9tIFRhZ3NcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJzaG91bGQgYXBwbHkgYWRkaXRpb25hbCBjdXN0b20gdGFnc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBjb25maWc6IFRhZ2dpbmdDb25maWcgPSB7XG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgICAgYWRkaXRpb25hbFRhZ3M6IHtcbiAgICAgICAgICBUZWFtOiBcIlBsYXRmb3JtXCIsXG4gICAgICAgICAgQXBwbGljYXRpb246IFwiV2ViQXBwXCIsXG4gICAgICAgIH0sXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgICAgVGFnczogZXhwZWN0LmFycmF5Q29udGFpbmluZyhbXG4gICAgICAgICAgeyBLZXk6IFwiVGVhbVwiLCBWYWx1ZTogXCJQbGF0Zm9ybVwiIH0sXG4gICAgICAgICAgeyBLZXk6IFwiQXBwbGljYXRpb25cIiwgVmFsdWU6IFwiV2ViQXBwXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwic2hvdWxkIHdvcmsgd2l0aG91dCBhZGRpdGlvbmFsIHRhZ3NcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gU2hvdWxkIHN0aWxsIGhhdmUgY29yZSB0YWdzXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBleHBlY3QuYXJyYXlDb250YWluaW5nKFtcbiAgICAgICAgICB7IEtleTogXCJFbnZpcm9ubWVudFwiLCBWYWx1ZTogXCJQcm9kXCIgfSxcbiAgICAgICAgICB7IEtleTogXCJQcm9qZWN0XCIsIFZhbHVlOiBcIkFJU3R1ZGlvXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJOb24tVGFnZ2FibGUgUmVzb3VyY2VzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvdWxkIG5vdCBmYWlsIG9uIG5vbi10YWdnYWJsZSByZXNvdXJjZXNcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICAvLyBDbG91ZEZvcm1hdGlvbiBvdXRwdXQgaXMgbm90IHRhZ2dhYmxlXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dChzdGFjaywgXCJUZXN0T3V0cHV0XCIsIHtcbiAgICAgICAgdmFsdWU6IFwidGVzdC12YWx1ZVwiLFxuICAgICAgfSlcblxuICAgICAgLy8gU2hvdWxkIG5vdCB0aHJvdyBhbiBlcnJvclxuICAgICAgZXhwZWN0KCgpID0+IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaykpLm5vdC50b1Rocm93KClcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiTWFuYWdlZEJ5IFRhZ1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBhbHdheXMgc2V0IE1hbmFnZWRCeSB0byBDREtcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgY29uZmlnOiBUYWdnaW5nQ29uZmlnID0ge1xuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgcHJvamVjdE5hbWU6IFwiQUlTdHVkaW9cIixcbiAgICAgICAgb3duZXI6IFwiVFNEIEVuZ2luZWVyaW5nXCIsXG4gICAgICAgIHN0YWNrTmFtZTogXCJUZXN0U3RhY2tcIixcbiAgICAgIH1cblxuICAgICAgY29uc3QgYXNwZWN0ID0gbmV3IFRhZ2dpbmdBc3BlY3QoY29uZmlnKVxuICAgICAgY2RrLkFzcGVjdHMub2Yoc3RhY2spLmFkZChhc3BlY3QpXG5cbiAgICAgIG5ldyBjZGsuYXdzX3MzLkJ1Y2tldChzdGFjaywgXCJUZXN0QnVja2V0XCIpXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgICBUYWdzOiBleHBlY3QuYXJyYXlDb250YWluaW5nKFtcbiAgICAgICAgICB7IEtleTogXCJNYW5hZ2VkQnlcIiwgVmFsdWU6IFwiQ0RLXCIgfSxcbiAgICAgICAgXSksXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJEZXBsb3llZEF0IFRhZ1wiLCAoKSA9PiB7XG4gICAgdGVzdChcInNob3VsZCBzZXQgRGVwbG95ZWRBdCB0byB2YWxpZCBJU08gdGltZXN0YW1wXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGNvbmZpZzogVGFnZ2luZ0NvbmZpZyA9IHtcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIHByb2plY3ROYW1lOiBcIkFJU3R1ZGlvXCIsXG4gICAgICAgIG93bmVyOiBcIlRTRCBFbmdpbmVlcmluZ1wiLFxuICAgICAgICBzdGFja05hbWU6IFwiVGVzdFN0YWNrXCIsXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGFzcGVjdCA9IG5ldyBUYWdnaW5nQXNwZWN0KGNvbmZpZylcbiAgICAgIGNkay5Bc3BlY3RzLm9mKHN0YWNrKS5hZGQoYXNwZWN0KVxuXG4gICAgICBuZXcgY2RrLmF3c19zMy5CdWNrZXQoc3RhY2ssIFwiVGVzdEJ1Y2tldFwiKVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcbiAgICAgIGNvbnN0IGJ1Y2tldFJlc291cmNlID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6UzM6OkJ1Y2tldFwiKVxuICAgICAgY29uc3QgYnVja2V0ID0gT2JqZWN0LnZhbHVlcyhidWNrZXRSZXNvdXJjZSlbMF1cbiAgICAgIGNvbnN0IGRlcGxveWVkQXRUYWcgPSBidWNrZXQuUHJvcGVydGllcy5UYWdzLmZpbmQoXG4gICAgICAgICh0YWc6IGFueSkgPT4gdGFnLktleSA9PT0gXCJEZXBsb3llZEF0XCJcbiAgICAgIClcblxuICAgICAgZXhwZWN0KGRlcGxveWVkQXRUYWcpLnRvQmVEZWZpbmVkKClcbiAgICAgIGV4cGVjdChkZXBsb3llZEF0VGFnLlZhbHVlKS50b01hdGNoKC9eXFxkezR9LVxcZHsyfS1cXGR7Mn1ULylcbiAgICB9KVxuICB9KVxufSlcbiJdfQ==