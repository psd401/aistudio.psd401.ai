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
const rds = __importStar(require("aws-cdk-lib/aws-rds"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const aurora_cost_optimizer_1 = require("../../lib/constructs/database/aurora-cost-optimizer");
describe("AuroraCostOptimizer", () => {
    let app;
    let stack;
    let mockCluster;
    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack");
        // Create a mock cluster
        mockCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(stack, "MockCluster", {
            clusterIdentifier: "test-cluster",
        });
    });
    describe("Development Environment", () => {
        test("enables auto-pause by default", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "DevOptimizer", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should create pause/resume Lambda
            template.hasResourceProperties("AWS::Lambda::Function", {
                Handler: "pause_resume.handler",
                Runtime: "python3.12",
                Environment: {
                    Variables: {
                        CLUSTER_IDENTIFIER: "test-cluster",
                        ENVIRONMENT: "dev",
                        IDLE_MINUTES_THRESHOLD: "30",
                    },
                },
            });
            // Should create auto-pause schedule
            template.hasResourceProperties("AWS::Events::Rule", {
                ScheduleExpression: "rate(15 minutes)",
                State: "ENABLED",
            });
        });
        test("does not create scheduled scaling by default", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "DevOptimizer", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should not create scaling Lambda for dev
            const functions = template.findResources("AWS::Lambda::Function");
            const scalingFunctions = Object.values(functions).filter((fn) => fn.Properties?.Handler?.includes("predictive_scaling"));
            expect(scalingFunctions).toHaveLength(0);
        });
        test("allows custom idle timeout", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "DevOptimizer", {
                cluster: mockCluster,
                environment: "dev",
                idleMinutesBeforePause: 60,
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        IDLE_MINUTES_THRESHOLD: "60",
                    }),
                },
            });
        });
        test("creates CloudWatch alarm for errors", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "DevOptimizer", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Alarm", {
                MetricName: "Errors",
                Namespace: "AWS/Lambda",
                Threshold: 3,
                EvaluationPeriods: 1,
            });
        });
    });
    describe("Staging Environment", () => {
        test("enables both auto-pause and scheduled scaling", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "StagingOptimizer", {
                cluster: mockCluster,
                environment: "staging",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should have pause/resume Lambda
            template.hasResourceProperties("AWS::Lambda::Function", {
                Handler: "pause_resume.handler",
            });
            // Should have scaling Lambda
            template.hasResourceProperties("AWS::Lambda::Function", {
                Handler: "predictive_scaling.handler",
            });
            // Should have multiple schedules
            const rules = template.findResources("AWS::Events::Rule");
            expect(Object.keys(rules).length).toBeGreaterThan(2); // At least pause check + scale up + scale down
        });
        test("creates business hours scale-up schedule", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "StagingOptimizer", {
                cluster: mockCluster,
                environment: "staging",
                businessHours: {
                    scaleUpHour: 8,
                    daysOfWeek: "MON-FRI",
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Events::Rule", {
                ScheduleExpression: assertions_1.Match.stringLikeRegexp("cron.*8.*MON-FRI"),
            });
        });
        test("creates after-hours scale-down schedule", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "StagingOptimizer", {
                cluster: mockCluster,
                environment: "staging",
                businessHours: {
                    scaleDownHour: 20,
                    daysOfWeek: "MON-FRI",
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Events::Rule", {
                ScheduleExpression: assertions_1.Match.stringLikeRegexp("cron.*20.*MON-FRI"),
            });
        });
    });
    describe("Production Environment", () => {
        test("disables auto-pause by default", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "ProdOptimizer", {
                cluster: mockCluster,
                environment: "prod",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should not have auto-pause schedule (only scaling schedules)
            const rules = template.findResources("AWS::Events::Rule");
            const autoPauseRules = Object.values(rules).filter((rule) => rule.Properties?.Description?.toLowerCase().includes("pause"));
            expect(autoPauseRules).toHaveLength(0);
        });
        test("enables scheduled scaling by default", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "ProdOptimizer", {
                cluster: mockCluster,
                environment: "prod",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should have scaling Lambda
            template.hasResourceProperties("AWS::Lambda::Function", {
                Handler: "predictive_scaling.handler",
                Environment: {
                    Variables: {
                        ENVIRONMENT: "prod",
                    },
                },
            });
            // Should have multiple scaling schedules
            const rules = template.findResources("AWS::Events::Rule");
            expect(Object.keys(rules).length).toBeGreaterThanOrEqual(2);
        });
        test("creates weekend minimal scaling", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "ProdOptimizer", {
                cluster: mockCluster,
                environment: "prod",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::Events::Rule", {
                ScheduleExpression: assertions_1.Match.stringLikeRegexp("cron.*SAT"),
            });
        });
        test("allows explicit auto-pause override", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "ProdOptimizer", {
                cluster: mockCluster,
                environment: "prod",
                enableAutoPause: true, // Explicitly enable (not recommended for prod)
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should now have pause/resume Lambda
            template.hasResourceProperties("AWS::Lambda::Function", {
                Handler: "pause_resume.handler",
            });
        });
    });
    describe("IAM Permissions", () => {
        test("grants RDS modification permissions to pause/resume Lambda with least privilege", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "Optimizer", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Verify RDS actions are granted
            const policies = template.findResources("AWS::IAM::Policy");
            const policyStatements = Object.values(policies).flatMap((policy) => policy.Properties.PolicyDocument.Statement);
            // Check for RDS permissions scoped to cluster ARN
            const rdsStatement = policyStatements.find((stmt) => stmt.Action?.includes("rds:ModifyDBCluster"));
            expect(rdsStatement).toBeDefined();
            expect(rdsStatement?.Action).toContain("rds:ModifyDBCluster");
            expect(rdsStatement?.Action).toContain("rds:DescribeDBClusters");
            // Resource should be an array with cluster ARN (may be intrinsic function in template)
            expect(Array.isArray(rdsStatement?.Resource) || typeof rdsStatement?.Resource === 'object').toBeTruthy();
            expect(rdsStatement?.Resource).not.toBe("*"); // Verify it's not wildcard
            // Check for CloudWatch permissions with namespace condition
            const cloudWatchStatement = policyStatements.find((stmt) => stmt.Action?.includes("cloudwatch:GetMetricStatistics"));
            expect(cloudWatchStatement).toBeDefined();
            expect(cloudWatchStatement?.Action).toContain("cloudwatch:GetMetricStatistics");
            expect(cloudWatchStatement?.Resource).toBe("*");
            expect(cloudWatchStatement?.Condition?.StringEquals).toEqual({
                "cloudwatch:namespace": "AWS/RDS"
            });
        });
        test("grants RDS permissions to scaling Lambda", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "Optimizer", {
                cluster: mockCluster,
                environment: "staging",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::IAM::Policy", {
                PolicyDocument: {
                    Statement: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            Action: assertions_1.Match.arrayWith([
                                "rds:ModifyDBCluster",
                                "rds:DescribeDBClusters",
                            ]),
                        }),
                    ]),
                },
            });
        });
    });
    describe("Custom Configuration", () => {
        test("accepts custom scaling parameters", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "Optimizer", {
                cluster: mockCluster,
                environment: "prod",
                scaling: {
                    businessHoursMin: 4.0,
                    businessHoursMax: 16.0,
                    offHoursMin: 2.0,
                    offHoursMax: 8.0,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            // Verify Lambda has environment variables set
            template.hasResourceProperties("AWS::Lambda::Function", {
                Handler: "predictive_scaling.handler",
            });
        });
        test("can disable auto-pause explicitly", () => {
            new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "Optimizer", {
                cluster: mockCluster,
                environment: "dev",
                enableAutoPause: false,
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should not have auto-pause schedules
            const rules = template.findResources("AWS::Events::Rule");
            expect(Object.keys(rules)).toHaveLength(0);
        });
    });
    describe("Lambda Configuration", () => {
        test("creates Lambda functions with proper configuration", () => {
            const optimizer = new aurora_cost_optimizer_1.AuroraCostOptimizer(stack, "Optimizer", {
                cluster: mockCluster,
                environment: "staging",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Check that pause/resume Lambda was created
            expect(optimizer.pauseResumeFunction).toBeDefined();
            expect(optimizer.pauseResumeFunction.runtime).toBe(lambda.Runtime.PYTHON_3_12);
            // Check that scaling Lambda was created (staging defaults to enable scheduled scaling)
            expect(optimizer.scalingFunction).toBeDefined();
            expect(optimizer.scalingFunction?.runtime).toBe(lambda.Runtime.PYTHON_3_12);
            // Verify reserved concurrency is set to prevent concurrent executions
            template.hasResourceProperties("AWS::Lambda::Function", {
                Runtime: "python3.12",
                Handler: "pause_resume.handler",
                ReservedConcurrentExecutions: 1,
            });
            template.hasResourceProperties("AWS::Lambda::Function", {
                Runtime: "python3.12",
                Handler: "predictive_scaling.handler",
                ReservedConcurrentExecutions: 1,
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVyb3JhLWNvc3Qtb3B0aW1pemVyLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdXJvcmEtY29zdC1vcHRpbWl6ZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFrQztBQUNsQyx1REFBd0Q7QUFDeEQseURBQTBDO0FBQzFDLCtEQUFnRDtBQUNoRCwrRkFBeUY7QUFFekYsUUFBUSxDQUFDLHFCQUFxQixFQUFFLEdBQUcsRUFBRTtJQUNuQyxJQUFJLEdBQVksQ0FBQTtJQUNoQixJQUFJLEtBQWdCLENBQUE7SUFDcEIsSUFBSSxXQUFpQyxDQUFBO0lBRXJDLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUE7UUFDbkIsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLENBQUE7UUFFdkMsd0JBQXdCO1FBQ3hCLFdBQVcsR0FBRyxHQUFHLENBQUMsZUFBZSxDQUFDLDZCQUE2QixDQUM3RCxLQUFLLEVBQ0wsYUFBYSxFQUNiO1lBQ0UsaUJBQWlCLEVBQUUsY0FBYztTQUNsQyxDQUNGLENBQUE7SUFDSCxDQUFDLENBQUMsQ0FBQTtJQUVGLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxHQUFHLEVBQUU7UUFDdkMsSUFBSSxDQUFDLCtCQUErQixFQUFFLEdBQUcsRUFBRTtZQUN6QyxJQUFJLDJDQUFtQixDQUFDLEtBQUssRUFBRSxjQUFjLEVBQUU7Z0JBQzdDLE9BQU8sRUFBRSxXQUFXO2dCQUNwQixXQUFXLEVBQUUsS0FBSzthQUNuQixDQUFDLENBQUE7WUFFRixNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQTtZQUUxQyxvQ0FBb0M7WUFDcEMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHVCQUF1QixFQUFF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QUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUE7WUFFM0Usc0VBQXNFO1lBQ3RFLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDdEQsT0FBTyxFQUFFLFlBQVk7Z0JBQ3JCLE9BQU8sRUFBRSxzQkFBc0I7Z0JBQy9CLDRCQUE0QixFQUFFLENBQUM7YUFDaEMsQ0FBQyxDQUFBO1lBRUYsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHVCQUF1QixFQUFFO2dCQUN0RCxPQUFPLEVBQUUsWUFBWTtnQkFDckIsT0FBTyxFQUFFLDRCQUE0QjtnQkFDckMsNEJBQTRCLEVBQUUsQ0FBQzthQUNoQyxDQUFDLENBQUE7UUFDSixDQUFDLENBQUMsQ0FBQTtJQUNKLENBQUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQyxDQUFDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCJcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCJcbmltcG9ydCAqIGFzIHJkcyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXJkc1wiXG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIlxuaW1wb3J0IHsgQXVyb3JhQ29zdE9wdGltaXplciB9IGZyb20gXCIuLi8uLi9saWIvY29uc3RydWN0cy9kYXRhYmFzZS9hdXJvcmEtY29zdC1vcHRpbWl6ZXJcIlxuXG5kZXNjcmliZShcIkF1cm9yYUNvc3RPcHRpbWl6ZXJcIiwgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwXG4gIGxldCBzdGFjazogY2RrLlN0YWNrXG4gIGxldCBtb2NrQ2x1c3RlcjogcmRzLklEYXRhYmFzZUNsdXN0ZXJcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpXG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIilcblxuICAgIC8vIENyZWF0ZSBhIG1vY2sgY2x1c3RlclxuICAgIG1vY2tDbHVzdGVyID0gcmRzLkRhdGFiYXNlQ2x1c3Rlci5mcm9tRGF0YWJhc2VDbHVzdGVyQXR0cmlidXRlcyhcbiAgICAgIHN0YWNrLFxuICAgICAgXCJNb2NrQ2x1c3RlclwiLFxuICAgICAge1xuICAgICAgICBjbHVzdGVySWRlbnRpZmllcjogXCJ0ZXN0LWNsdXN0ZXJcIixcbiAgICAgIH1cbiAgICApXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJEZXZlbG9wbWVudCBFbnZpcm9ubWVudFwiLCAoKSA9PiB7XG4gICAgdGVzdChcImVuYWJsZXMgYXV0by1wYXVzZSBieSBkZWZhdWx0XCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0T3B0aW1pemVyKHN0YWNrLCBcIkRldk9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICAvLyBTaG91bGQgY3JlYXRlIHBhdXNlL3Jlc3VtZSBMYW1iZGFcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEhhbmRsZXI6IFwicGF1c2VfcmVzdW1lLmhhbmRsZXJcIixcbiAgICAgICAgUnVudGltZTogXCJweXRob24zLjEyXCIsXG4gICAgICAgIEVudmlyb25tZW50OiB7XG4gICAgICAgICAgVmFyaWFibGVzOiB7XG4gICAgICAgICAgICBDTFVTVEVSX0lERU5USUZJRVI6IFwidGVzdC1jbHVzdGVyXCIsXG4gICAgICAgICAgICBFTlZJUk9OTUVOVDogXCJkZXZcIixcbiAgICAgICAgICAgIElETEVfTUlOVVRFU19USFJFU0hPTEQ6IFwiMzBcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgLy8gU2hvdWxkIGNyZWF0ZSBhdXRvLXBhdXNlIHNjaGVkdWxlXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkV2ZW50czo6UnVsZVwiLCB7XG4gICAgICAgIFNjaGVkdWxlRXhwcmVzc2lvbjogXCJyYXRlKDE1IG1pbnV0ZXMpXCIsXG4gICAgICAgIFN0YXRlOiBcIkVOQUJMRURcIixcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJkb2VzIG5vdCBjcmVhdGUgc2NoZWR1bGVkIHNjYWxpbmcgYnkgZGVmYXVsdFwiLCAoKSA9PiB7XG4gICAgICBuZXcgQXVyb3JhQ29zdE9wdGltaXplcihzdGFjaywgXCJEZXZPcHRpbWl6ZXJcIiwge1xuICAgICAgICBjbHVzdGVyOiBtb2NrQ2x1c3RlcixcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gU2hvdWxkIG5vdCBjcmVhdGUgc2NhbGluZyBMYW1iZGEgZm9yIGRldlxuICAgICAgY29uc3QgZnVuY3Rpb25zID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiKVxuICAgICAgY29uc3Qgc2NhbGluZ0Z1bmN0aW9ucyA9IE9iamVjdC52YWx1ZXMoZnVuY3Rpb25zKS5maWx0ZXIoKGZuOiBhbnkpID0+XG4gICAgICAgIGZuLlByb3BlcnRpZXM/LkhhbmRsZXI/LmluY2x1ZGVzKFwicHJlZGljdGl2ZV9zY2FsaW5nXCIpXG4gICAgICApXG5cbiAgICAgIGV4cGVjdChzY2FsaW5nRnVuY3Rpb25zKS50b0hhdmVMZW5ndGgoMClcbiAgICB9KVxuXG4gICAgdGVzdChcImFsbG93cyBjdXN0b20gaWRsZSB0aW1lb3V0XCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0T3B0aW1pemVyKHN0YWNrLCBcIkRldk9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgICAgaWRsZU1pbnV0ZXNCZWZvcmVQYXVzZTogNjAsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgSURMRV9NSU5VVEVTX1RIUkVTSE9MRDogXCI2MFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImNyZWF0ZXMgQ2xvdWRXYXRjaCBhbGFybSBmb3IgZXJyb3JzXCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0T3B0aW1pemVyKHN0YWNrLCBcIkRldk9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkFsYXJtXCIsIHtcbiAgICAgICAgTWV0cmljTmFtZTogXCJFcnJvcnNcIixcbiAgICAgICAgTmFtZXNwYWNlOiBcIkFXUy9MYW1iZGFcIixcbiAgICAgICAgVGhyZXNob2xkOiAzLFxuICAgICAgICBFdmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIlN0YWdpbmcgRW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJlbmFibGVzIGJvdGggYXV0by1wYXVzZSBhbmQgc2NoZWR1bGVkIHNjYWxpbmdcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3RPcHRpbWl6ZXIoc3RhY2ssIFwiU3RhZ2luZ09wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJzdGFnaW5nXCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gU2hvdWxkIGhhdmUgcGF1c2UvcmVzdW1lIExhbWJkYVxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgSGFuZGxlcjogXCJwYXVzZV9yZXN1bWUuaGFuZGxlclwiLFxuICAgICAgfSlcblxuICAgICAgLy8gU2hvdWxkIGhhdmUgc2NhbGluZyBMYW1iZGFcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEhhbmRsZXI6IFwicHJlZGljdGl2ZV9zY2FsaW5nLmhhbmRsZXJcIixcbiAgICAgIH0pXG5cbiAgICAgIC8vIFNob3VsZCBoYXZlIG11bHRpcGxlIHNjaGVkdWxlc1xuICAgICAgY29uc3QgcnVsZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpFdmVudHM6OlJ1bGVcIilcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhydWxlcykubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMikgLy8gQXQgbGVhc3QgcGF1c2UgY2hlY2sgKyBzY2FsZSB1cCArIHNjYWxlIGRvd25cbiAgICB9KVxuXG4gICAgdGVzdChcImNyZWF0ZXMgYnVzaW5lc3MgaG91cnMgc2NhbGUtdXAgc2NoZWR1bGVcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3RPcHRpbWl6ZXIoc3RhY2ssIFwiU3RhZ2luZ09wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJzdGFnaW5nXCIsXG4gICAgICAgIGJ1c2luZXNzSG91cnM6IHtcbiAgICAgICAgICBzY2FsZVVwSG91cjogOCxcbiAgICAgICAgICBkYXlzT2ZXZWVrOiBcIk1PTi1GUklcIixcbiAgICAgICAgfSxcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkV2ZW50czo6UnVsZVwiLCB7XG4gICAgICAgIFNjaGVkdWxlRXhwcmVzc2lvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcImNyb24uKjguKk1PTi1GUklcIiksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBhZnRlci1ob3VycyBzY2FsZS1kb3duIHNjaGVkdWxlXCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0T3B0aW1pemVyKHN0YWNrLCBcIlN0YWdpbmdPcHRpbWl6ZXJcIiwge1xuICAgICAgICBjbHVzdGVyOiBtb2NrQ2x1c3RlcixcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwic3RhZ2luZ1wiLFxuICAgICAgICBidXNpbmVzc0hvdXJzOiB7XG4gICAgICAgICAgc2NhbGVEb3duSG91cjogMjAsXG4gICAgICAgICAgZGF5c09mV2VlazogXCJNT04tRlJJXCIsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpFdmVudHM6OlJ1bGVcIiwge1xuICAgICAgICBTY2hlZHVsZUV4cHJlc3Npb246IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJjcm9uLioyMC4qTU9OLUZSSVwiKSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIlByb2R1Y3Rpb24gRW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJkaXNhYmxlcyBhdXRvLXBhdXNlIGJ5IGRlZmF1bHRcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3RPcHRpbWl6ZXIoc3RhY2ssIFwiUHJvZE9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gU2hvdWxkIG5vdCBoYXZlIGF1dG8tcGF1c2Ugc2NoZWR1bGUgKG9ubHkgc2NhbGluZyBzY2hlZHVsZXMpXG4gICAgICBjb25zdCBydWxlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkV2ZW50czo6UnVsZVwiKVxuICAgICAgY29uc3QgYXV0b1BhdXNlUnVsZXMgPSBPYmplY3QudmFsdWVzKHJ1bGVzKS5maWx0ZXIoKHJ1bGU6IGFueSkgPT5cbiAgICAgICAgcnVsZS5Qcm9wZXJ0aWVzPy5EZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhcInBhdXNlXCIpXG4gICAgICApXG5cbiAgICAgIGV4cGVjdChhdXRvUGF1c2VSdWxlcykudG9IYXZlTGVuZ3RoKDApXG4gICAgfSlcblxuICAgIHRlc3QoXCJlbmFibGVzIHNjaGVkdWxlZCBzY2FsaW5nIGJ5IGRlZmF1bHRcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3RPcHRpbWl6ZXIoc3RhY2ssIFwiUHJvZE9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gU2hvdWxkIGhhdmUgc2NhbGluZyBMYW1iZGFcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6TGFtYmRhOjpGdW5jdGlvblwiLCB7XG4gICAgICAgIEhhbmRsZXI6IFwicHJlZGljdGl2ZV9zY2FsaW5nLmhhbmRsZXJcIixcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IHtcbiAgICAgICAgICAgIEVOVklST05NRU5UOiBcInByb2RcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSlcblxuICAgICAgLy8gU2hvdWxkIGhhdmUgbXVsdGlwbGUgc2NhbGluZyBzY2hlZHVsZXNcbiAgICAgIGNvbnN0IHJ1bGVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6RXZlbnRzOjpSdWxlXCIpXG4gICAgICBleHBlY3QoT2JqZWN0LmtleXMocnVsZXMpLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgyKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlcyB3ZWVrZW5kIG1pbmltYWwgc2NhbGluZ1wiLCAoKSA9PiB7XG4gICAgICBuZXcgQXVyb3JhQ29zdE9wdGltaXplcihzdGFjaywgXCJQcm9kT3B0aW1pemVyXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkV2ZW50czo6UnVsZVwiLCB7XG4gICAgICAgIFNjaGVkdWxlRXhwcmVzc2lvbjogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcImNyb24uKlNBVFwiKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJhbGxvd3MgZXhwbGljaXQgYXV0by1wYXVzZSBvdmVycmlkZVwiLCAoKSA9PiB7XG4gICAgICBuZXcgQXVyb3JhQ29zdE9wdGltaXplcihzdGFjaywgXCJQcm9kT3B0aW1pemVyXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgICAgZW5hYmxlQXV0b1BhdXNlOiB0cnVlLCAvLyBFeHBsaWNpdGx5IGVuYWJsZSAobm90IHJlY29tbWVuZGVkIGZvciBwcm9kKVxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIFNob3VsZCBub3cgaGF2ZSBwYXVzZS9yZXN1bWUgTGFtYmRhXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBIYW5kbGVyOiBcInBhdXNlX3Jlc3VtZS5oYW5kbGVyXCIsXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJJQU0gUGVybWlzc2lvbnNcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJncmFudHMgUkRTIG1vZGlmaWNhdGlvbiBwZXJtaXNzaW9ucyB0byBwYXVzZS9yZXN1bWUgTGFtYmRhIHdpdGggbGVhc3QgcHJpdmlsZWdlXCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0T3B0aW1pemVyKHN0YWNrLCBcIk9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICAvLyBWZXJpZnkgUkRTIGFjdGlvbnMgYXJlIGdyYW50ZWRcbiAgICAgIGNvbnN0IHBvbGljaWVzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcyhcIkFXUzo6SUFNOjpQb2xpY3lcIilcbiAgICAgIGNvbnN0IHBvbGljeVN0YXRlbWVudHMgPSBPYmplY3QudmFsdWVzKHBvbGljaWVzKS5mbGF0TWFwKChwb2xpY3k6IGFueSkgPT5cbiAgICAgICAgcG9saWN5LlByb3BlcnRpZXMuUG9saWN5RG9jdW1lbnQuU3RhdGVtZW50XG4gICAgICApXG5cbiAgICAgIC8vIENoZWNrIGZvciBSRFMgcGVybWlzc2lvbnMgc2NvcGVkIHRvIGNsdXN0ZXIgQVJOXG4gICAgICBjb25zdCByZHNTdGF0ZW1lbnQgPSBwb2xpY3lTdGF0ZW1lbnRzLmZpbmQoKHN0bXQ6IGFueSkgPT5cbiAgICAgICAgc3RtdC5BY3Rpb24/LmluY2x1ZGVzKFwicmRzOk1vZGlmeURCQ2x1c3RlclwiKVxuICAgICAgKVxuICAgICAgZXhwZWN0KHJkc1N0YXRlbWVudCkudG9CZURlZmluZWQoKVxuICAgICAgZXhwZWN0KHJkc1N0YXRlbWVudD8uQWN0aW9uKS50b0NvbnRhaW4oXCJyZHM6TW9kaWZ5REJDbHVzdGVyXCIpXG4gICAgICBleHBlY3QocmRzU3RhdGVtZW50Py5BY3Rpb24pLnRvQ29udGFpbihcInJkczpEZXNjcmliZURCQ2x1c3RlcnNcIilcbiAgICAgIC8vIFJlc291cmNlIHNob3VsZCBiZSBhbiBhcnJheSB3aXRoIGNsdXN0ZXIgQVJOIChtYXkgYmUgaW50cmluc2ljIGZ1bmN0aW9uIGluIHRlbXBsYXRlKVxuICAgICAgZXhwZWN0KEFycmF5LmlzQXJyYXkocmRzU3RhdGVtZW50Py5SZXNvdXJjZSkgfHwgdHlwZW9mIHJkc1N0YXRlbWVudD8uUmVzb3VyY2UgPT09ICdvYmplY3QnKS50b0JlVHJ1dGh5KClcbiAgICAgIGV4cGVjdChyZHNTdGF0ZW1lbnQ/LlJlc291cmNlKS5ub3QudG9CZShcIipcIikgLy8gVmVyaWZ5IGl0J3Mgbm90IHdpbGRjYXJkXG5cbiAgICAgIC8vIENoZWNrIGZvciBDbG91ZFdhdGNoIHBlcm1pc3Npb25zIHdpdGggbmFtZXNwYWNlIGNvbmRpdGlvblxuICAgICAgY29uc3QgY2xvdWRXYXRjaFN0YXRlbWVudCA9IHBvbGljeVN0YXRlbWVudHMuZmluZCgoc3RtdDogYW55KSA9PlxuICAgICAgICBzdG10LkFjdGlvbj8uaW5jbHVkZXMoXCJjbG91ZHdhdGNoOkdldE1ldHJpY1N0YXRpc3RpY3NcIilcbiAgICAgIClcbiAgICAgIGV4cGVjdChjbG91ZFdhdGNoU3RhdGVtZW50KS50b0JlRGVmaW5lZCgpXG4gICAgICBleHBlY3QoY2xvdWRXYXRjaFN0YXRlbWVudD8uQWN0aW9uKS50b0NvbnRhaW4oXCJjbG91ZHdhdGNoOkdldE1ldHJpY1N0YXRpc3RpY3NcIilcbiAgICAgIGV4cGVjdChjbG91ZFdhdGNoU3RhdGVtZW50Py5SZXNvdXJjZSkudG9CZShcIipcIilcbiAgICAgIGV4cGVjdChjbG91ZFdhdGNoU3RhdGVtZW50Py5Db25kaXRpb24/LlN0cmluZ0VxdWFscykudG9FcXVhbCh7XG4gICAgICAgIFwiY2xvdWR3YXRjaDpuYW1lc3BhY2VcIjogXCJBV1MvUkRTXCJcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJncmFudHMgUkRTIHBlcm1pc3Npb25zIHRvIHNjYWxpbmcgTGFtYmRhXCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0T3B0aW1pemVyKHN0YWNrLCBcIk9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJzdGFnaW5nXCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlBvbGljeVwiLCB7XG4gICAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgICBcInJkczpNb2RpZnlEQkNsdXN0ZXJcIixcbiAgICAgICAgICAgICAgICBcInJkczpEZXNjcmliZURCQ2x1c3RlcnNcIixcbiAgICAgICAgICAgICAgXSksXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdKSxcbiAgICAgICAgfSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkN1c3RvbSBDb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwiYWNjZXB0cyBjdXN0b20gc2NhbGluZyBwYXJhbWV0ZXJzXCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0T3B0aW1pemVyKHN0YWNrLCBcIk9wdGltaXplclwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIHNjYWxpbmc6IHtcbiAgICAgICAgICBidXNpbmVzc0hvdXJzTWluOiA0LjAsXG4gICAgICAgICAgYnVzaW5lc3NIb3Vyc01heDogMTYuMCxcbiAgICAgICAgICBvZmZIb3Vyc01pbjogMi4wLFxuICAgICAgICAgIG9mZkhvdXJzTWF4OiA4LjAsXG4gICAgICAgIH0sXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gVmVyaWZ5IExhbWJkYSBoYXMgZW52aXJvbm1lbnQgdmFyaWFibGVzIHNldFxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgSGFuZGxlcjogXCJwcmVkaWN0aXZlX3NjYWxpbmcuaGFuZGxlclwiLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImNhbiBkaXNhYmxlIGF1dG8tcGF1c2UgZXhwbGljaXRseVwiLCAoKSA9PiB7XG4gICAgICBuZXcgQXVyb3JhQ29zdE9wdGltaXplcihzdGFjaywgXCJPcHRpbWl6ZXJcIiwge1xuICAgICAgICBjbHVzdGVyOiBtb2NrQ2x1c3RlcixcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICAgIGVuYWJsZUF1dG9QYXVzZTogZmFsc2UsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgLy8gU2hvdWxkIG5vdCBoYXZlIGF1dG8tcGF1c2Ugc2NoZWR1bGVzXG4gICAgICBjb25zdCBydWxlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkV2ZW50czo6UnVsZVwiKVxuICAgICAgZXhwZWN0KE9iamVjdC5rZXlzKHJ1bGVzKSkudG9IYXZlTGVuZ3RoKDApXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkxhbWJkYSBDb25maWd1cmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwiY3JlYXRlcyBMYW1iZGEgZnVuY3Rpb25zIHdpdGggcHJvcGVyIGNvbmZpZ3VyYXRpb25cIiwgKCkgPT4ge1xuICAgICAgY29uc3Qgb3B0aW1pemVyID0gbmV3IEF1cm9yYUNvc3RPcHRpbWl6ZXIoc3RhY2ssIFwiT3B0aW1pemVyXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcInN0YWdpbmdcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICAvLyBDaGVjayB0aGF0IHBhdXNlL3Jlc3VtZSBMYW1iZGEgd2FzIGNyZWF0ZWRcbiAgICAgIGV4cGVjdChvcHRpbWl6ZXIucGF1c2VSZXN1bWVGdW5jdGlvbikudG9CZURlZmluZWQoKVxuICAgICAgZXhwZWN0KG9wdGltaXplci5wYXVzZVJlc3VtZUZ1bmN0aW9uLnJ1bnRpbWUpLnRvQmUobGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTIpXG5cbiAgICAgIC8vIENoZWNrIHRoYXQgc2NhbGluZyBMYW1iZGEgd2FzIGNyZWF0ZWQgKHN0YWdpbmcgZGVmYXVsdHMgdG8gZW5hYmxlIHNjaGVkdWxlZCBzY2FsaW5nKVxuICAgICAgZXhwZWN0KG9wdGltaXplci5zY2FsaW5nRnVuY3Rpb24pLnRvQmVEZWZpbmVkKClcbiAgICAgIGV4cGVjdChvcHRpbWl6ZXIuc2NhbGluZ0Z1bmN0aW9uPy5ydW50aW1lKS50b0JlKGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEyKVxuXG4gICAgICAvLyBWZXJpZnkgcmVzZXJ2ZWQgY29uY3VycmVuY3kgaXMgc2V0IHRvIHByZXZlbnQgY29uY3VycmVudCBleGVjdXRpb25zXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkxhbWJkYTo6RnVuY3Rpb25cIiwge1xuICAgICAgICBSdW50aW1lOiBcInB5dGhvbjMuMTJcIixcbiAgICAgICAgSGFuZGxlcjogXCJwYXVzZV9yZXN1bWUuaGFuZGxlclwiLFxuICAgICAgICBSZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiAxLFxuICAgICAgfSlcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgUnVudGltZTogXCJweXRob24zLjEyXCIsXG4gICAgICAgIEhhbmRsZXI6IFwicHJlZGljdGl2ZV9zY2FsaW5nLmhhbmRsZXJcIixcbiAgICAgICAgUmVzZXJ2ZWRDb25jdXJyZW50RXhlY3V0aW9uczogMSxcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=