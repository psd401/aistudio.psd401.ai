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
const aurora_cost_dashboard_1 = require("../../lib/constructs/database/aurora-cost-dashboard");
describe("AuroraCostDashboard", () => {
    let app;
    let stack;
    let mockCluster;
    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, "TestStack", {
            env: { region: "us-east-1" },
        });
        mockCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(stack, "MockCluster", {
            clusterIdentifier: "test-cluster",
        });
    });
    describe("Dashboard Creation", () => {
        test("creates CloudWatch dashboard", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardName: "aurora-cost-dev",
            });
        });
        test("accepts custom dashboard name", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "prod",
                dashboardName: "my-custom-dashboard",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardName: "my-custom-dashboard",
            });
        });
        test("creates dashboard for each environment", () => {
            const environments = [
                "dev",
                "staging",
                "prod",
            ];
            environments.forEach((env) => {
                const envStack = new cdk.Stack(app, `${env}Stack`, {
                    env: { region: "us-east-1" },
                });
                const envCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(envStack, "Cluster", { clusterIdentifier: `${env}-cluster` });
                new aurora_cost_dashboard_1.AuroraCostDashboard(envStack, "Dashboard", {
                    cluster: envCluster,
                    environment: env,
                });
                const template = assertions_1.Template.fromStack(envStack);
                template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                    DashboardName: `aurora-cost-${env}`,
                });
            });
        });
    });
    describe("Dashboard Content", () => {
        test("includes ACU capacity metric", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardBody: assertions_1.Match.stringLikeRegexp("ServerlessDatabaseCapacity"),
            });
        });
        test("includes database connections metric", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardBody: assertions_1.Match.stringLikeRegexp("DatabaseConnections"),
            });
        });
        test("includes CPU utilization metric", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardBody: assertions_1.Match.stringLikeRegexp("CPUUtilization"),
            });
        });
        test("includes cost calculation expressions", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard");
            const dashboard = Object.values(dashboardBody)[0];
            const body = JSON.parse(dashboard.Properties.DashboardBody);
            // Should have math expressions for cost calculations
            const hasCostCalculation = body.widgets.some((widget) => JSON.stringify(widget).includes("0.12")); // $0.12 per ACU-hour
            expect(hasCostCalculation).toBe(true);
        });
    });
    describe("Environment-Specific Content", () => {
        test("shows correct savings target for dev", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardBody: assertions_1.Match.stringLikeRegexp("\\$42"),
            });
        });
        test("shows correct savings target for staging", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "staging",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardBody: assertions_1.Match.stringLikeRegexp("\\$20"),
            });
        });
        test("shows correct savings target for prod", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "prod",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                DashboardBody: assertions_1.Match.stringLikeRegexp("\\$53"),
            });
        });
        test("includes environment-specific optimization strategies", () => {
            const environments = {
                dev: "Auto-pause",
                staging: "Scheduled scaling",
                prod: "Predictive scaling",
            };
            Object.entries(environments).forEach(([env, strategy]) => {
                const envStack = new cdk.Stack(app, `${env}StrategyStack`, {
                    env: { region: "us-east-1" },
                });
                const envCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(envStack, "Cluster", { clusterIdentifier: `${env}-cluster` });
                new aurora_cost_dashboard_1.AuroraCostDashboard(envStack, "Dashboard", {
                    cluster: envCluster,
                    environment: env,
                });
                const template = assertions_1.Template.fromStack(envStack);
                template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
                    DashboardBody: assertions_1.Match.stringLikeRegexp(strategy.toLowerCase().replace("-", "")),
                });
            });
        });
    });
    describe("Outputs", () => {
        test("exports dashboard URL", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasOutput("*DashboardUrl*", {
                Value: assertions_1.Match.stringLikeRegexp("https://console.aws.amazon.com/cloudwatch.*aurora-cost-dev"),
            });
        });
        test("includes correct region in URL", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            template.hasOutput("*DashboardUrl*", {
                Value: assertions_1.Match.stringLikeRegexp("region=us-east-1"),
            });
        });
    });
    describe("Cost Tracking Widgets", () => {
        test("includes single value widgets for cost metrics", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard");
            const dashboard = Object.values(dashboardBody)[0];
            const body = JSON.parse(dashboard.Properties.DashboardBody);
            const singleValueWidgets = body.widgets.filter((w) => w.type === "metric" && w.properties?.view === "singleValue");
            expect(singleValueWidgets.length).toBeGreaterThan(0);
        });
        test("includes graph widgets for trends", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard");
            const dashboard = Object.values(dashboardBody)[0];
            const body = JSON.parse(dashboard.Properties.DashboardBody);
            const graphWidgets = body.widgets.filter((w) => w.type === "metric" && w.properties?.view === "timeSeries");
            expect(graphWidgets.length).toBeGreaterThan(0);
        });
        test("includes text widgets for documentation", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard");
            const dashboard = Object.values(dashboardBody)[0];
            const body = JSON.parse(dashboard.Properties.DashboardBody);
            const textWidgets = body.widgets.filter((w) => w.type === "text");
            expect(textWidgets.length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVyb3JhLWNvc3QtZGFzaGJvYXJkLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdXJvcmEtY29zdC1kYXNoYm9hcmQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFrQztBQUNsQyx1REFBd0Q7QUFDeEQseURBQTBDO0FBQzFDLCtGQUF5RjtBQUV6RixRQUFRLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBQ25DLElBQUksR0FBWSxDQUFBO0lBQ2hCLElBQUksS0FBZ0IsQ0FBQTtJQUNwQixJQUFJLFdBQWlDLENBQUE7SUFFckMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtRQUNuQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDdEMsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUM3QixDQUFDLENBQUE7UUFFRixXQUFXLEdBQUcsR0FBRyxDQUFDLGVBQWUsQ0FBQyw2QkFBNkIsQ0FDN0QsS0FBSyxFQUNMLGFBQWEsRUFDYjtZQUNFLGlCQUFpQixFQUFFLGNBQWM7U0FDbEMsQ0FDRixDQUFBO0lBQ0gsQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO1FBQ2xDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxHQUFHLEVBQUU7WUFDeEMsSUFBSSwyQ0FBbUIsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFO2dCQUMxQyxPQUFPLEVBQUUsV0FBVztnQkFDcEIsV0FBVyxFQUFFLEtBQUs7YUFDbkIsQ0FBQyxDQUFBO1lBRUYsTUFBTSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFMUMsUUFBUSxDQUFDLHFCQUFxQixDQUFD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dEUsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDL0MsQ0FBQyxDQUFDLENBQUE7SUFDSixDQUFDLENBQUMsQ0FBQTtBQUNKLENBQUMsQ0FBQyxDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiXG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiXG5pbXBvcnQgKiBhcyByZHMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1yZHNcIlxuaW1wb3J0IHsgQXVyb3JhQ29zdERhc2hib2FyZCB9IGZyb20gXCIuLi8uLi9saWIvY29uc3RydWN0cy9kYXRhYmFzZS9hdXJvcmEtY29zdC1kYXNoYm9hcmRcIlxuXG5kZXNjcmliZShcIkF1cm9yYUNvc3REYXNoYm9hcmRcIiwgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwXG4gIGxldCBzdGFjazogY2RrLlN0YWNrXG4gIGxldCBtb2NrQ2x1c3RlcjogcmRzLklEYXRhYmFzZUNsdXN0ZXJcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpXG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIiwge1xuICAgICAgZW52OiB7IHJlZ2lvbjogXCJ1cy1lYXN0LTFcIiB9LFxuICAgIH0pXG5cbiAgICBtb2NrQ2x1c3RlciA9IHJkcy5EYXRhYmFzZUNsdXN0ZXIuZnJvbURhdGFiYXNlQ2x1c3RlckF0dHJpYnV0ZXMoXG4gICAgICBzdGFjayxcbiAgICAgIFwiTW9ja0NsdXN0ZXJcIixcbiAgICAgIHtcbiAgICAgICAgY2x1c3RlcklkZW50aWZpZXI6IFwidGVzdC1jbHVzdGVyXCIsXG4gICAgICB9XG4gICAgKVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiRGFzaGJvYXJkIENyZWF0aW9uXCIsICgpID0+IHtcbiAgICB0ZXN0KFwiY3JlYXRlcyBDbG91ZFdhdGNoIGRhc2hib2FyZFwiLCAoKSA9PiB7XG4gICAgICBuZXcgQXVyb3JhQ29zdERhc2hib2FyZChzdGFjaywgXCJEYXNoYm9hcmRcIiwge1xuICAgICAgICBjbHVzdGVyOiBtb2NrQ2x1c3RlcixcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpEYXNoYm9hcmRcIiwge1xuICAgICAgICBEYXNoYm9hcmROYW1lOiBcImF1cm9yYS1jb3N0LWRldlwiLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImFjY2VwdHMgY3VzdG9tIGRhc2hib2FyZCBuYW1lXCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0RGFzaGJvYXJkKHN0YWNrLCBcIkRhc2hib2FyZFwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJwcm9kXCIsXG4gICAgICAgIGRhc2hib2FyZE5hbWU6IFwibXktY3VzdG9tLWRhc2hib2FyZFwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6RGFzaGJvYXJkXCIsIHtcbiAgICAgICAgRGFzaGJvYXJkTmFtZTogXCJteS1jdXN0b20tZGFzaGJvYXJkXCIsXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiY3JlYXRlcyBkYXNoYm9hcmQgZm9yIGVhY2ggZW52aXJvbm1lbnRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgZW52aXJvbm1lbnRzOiBBcnJheTxcImRldlwiIHwgXCJzdGFnaW5nXCIgfCBcInByb2RcIj4gPSBbXG4gICAgICAgIFwiZGV2XCIsXG4gICAgICAgIFwic3RhZ2luZ1wiLFxuICAgICAgICBcInByb2RcIixcbiAgICAgIF1cblxuICAgICAgZW52aXJvbm1lbnRzLmZvckVhY2goKGVudikgPT4ge1xuICAgICAgICBjb25zdCBlbnZTdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCBgJHtlbnZ9U3RhY2tgLCB7XG4gICAgICAgICAgZW52OiB7IHJlZ2lvbjogXCJ1cy1lYXN0LTFcIiB9LFxuICAgICAgICB9KVxuICAgICAgICBjb25zdCBlbnZDbHVzdGVyID0gcmRzLkRhdGFiYXNlQ2x1c3Rlci5mcm9tRGF0YWJhc2VDbHVzdGVyQXR0cmlidXRlcyhcbiAgICAgICAgICBlbnZTdGFjayxcbiAgICAgICAgICBcIkNsdXN0ZXJcIixcbiAgICAgICAgICB7IGNsdXN0ZXJJZGVudGlmaWVyOiBgJHtlbnZ9LWNsdXN0ZXJgIH1cbiAgICAgICAgKVxuXG4gICAgICAgIG5ldyBBdXJvcmFDb3N0RGFzaGJvYXJkKGVudlN0YWNrLCBcIkRhc2hib2FyZFwiLCB7XG4gICAgICAgICAgY2x1c3RlcjogZW52Q2x1c3RlcixcbiAgICAgICAgICBlbnZpcm9ubWVudDogZW52LFxuICAgICAgICB9KVxuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKGVudlN0YWNrKVxuXG4gICAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6RGFzaGJvYXJkXCIsIHtcbiAgICAgICAgICBEYXNoYm9hcmROYW1lOiBgYXVyb3JhLWNvc3QtJHtlbnZ9YCxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIkRhc2hib2FyZCBDb250ZW50XCIsICgpID0+IHtcbiAgICB0ZXN0KFwiaW5jbHVkZXMgQUNVIGNhcGFjaXR5IG1ldHJpY1wiLCAoKSA9PiB7XG4gICAgICBuZXcgQXVyb3JhQ29zdERhc2hib2FyZChzdGFjaywgXCJEYXNoYm9hcmRcIiwge1xuICAgICAgICBjbHVzdGVyOiBtb2NrQ2x1c3RlcixcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpEYXNoYm9hcmRcIiwge1xuICAgICAgICBEYXNoYm9hcmRCb2R5OiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKFwiU2VydmVybGVzc0RhdGFiYXNlQ2FwYWNpdHlcIiksXG4gICAgICB9KVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiaW5jbHVkZXMgZGF0YWJhc2UgY29ubmVjdGlvbnMgbWV0cmljXCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0RGFzaGJvYXJkKHN0YWNrLCBcIkRhc2hib2FyZFwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZFwiLCB7XG4gICAgICAgIERhc2hib2FyZEJvZHk6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJEYXRhYmFzZUNvbm5lY3Rpb25zXCIpLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImluY2x1ZGVzIENQVSB1dGlsaXphdGlvbiBtZXRyaWNcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6Q2xvdWRXYXRjaDo6RGFzaGJvYXJkXCIsIHtcbiAgICAgICAgRGFzaGJvYXJkQm9keTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cChcIkNQVVV0aWxpemF0aW9uXCIpLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImluY2x1ZGVzIGNvc3QgY2FsY3VsYXRpb24gZXhwcmVzc2lvbnNcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIGNvbnN0IGRhc2hib2FyZEJvZHkgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpDbG91ZFdhdGNoOjpEYXNoYm9hcmRcIilcbiAgICAgIGNvbnN0IGRhc2hib2FyZCA9IE9iamVjdC52YWx1ZXMoZGFzaGJvYXJkQm9keSlbMF0gYXMgYW55XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShkYXNoYm9hcmQuUHJvcGVydGllcy5EYXNoYm9hcmRCb2R5KVxuXG4gICAgICAvLyBTaG91bGQgaGF2ZSBtYXRoIGV4cHJlc3Npb25zIGZvciBjb3N0IGNhbGN1bGF0aW9uc1xuICAgICAgY29uc3QgaGFzQ29zdENhbGN1bGF0aW9uID0gYm9keS53aWRnZXRzLnNvbWUoKHdpZGdldDogYW55KSA9PlxuICAgICAgICBKU09OLnN0cmluZ2lmeSh3aWRnZXQpLmluY2x1ZGVzKFwiMC4xMlwiKVxuICAgICAgKSAvLyAkMC4xMiBwZXIgQUNVLWhvdXJcblxuICAgICAgZXhwZWN0KGhhc0Nvc3RDYWxjdWxhdGlvbikudG9CZSh0cnVlKVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJFbnZpcm9ubWVudC1TcGVjaWZpYyBDb250ZW50XCIsICgpID0+IHtcbiAgICB0ZXN0KFwic2hvd3MgY29ycmVjdCBzYXZpbmdzIHRhcmdldCBmb3IgZGV2XCIsICgpID0+IHtcbiAgICAgIG5ldyBBdXJvcmFDb3N0RGFzaGJvYXJkKHN0YWNrLCBcIkRhc2hib2FyZFwiLCB7XG4gICAgICAgIGNsdXN0ZXI6IG1vY2tDbHVzdGVyLFxuICAgICAgICBlbnZpcm9ubWVudDogXCJkZXZcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZFwiLCB7XG4gICAgICAgIERhc2hib2FyZEJvZHk6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJcXFxcJDQyXCIpLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3dzIGNvcnJlY3Qgc2F2aW5ncyB0YXJnZXQgZm9yIHN0YWdpbmdcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcInN0YWdpbmdcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZFwiLCB7XG4gICAgICAgIERhc2hib2FyZEJvZHk6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJcXFxcJDIwXCIpLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcInNob3dzIGNvcnJlY3Qgc2F2aW5ncyB0YXJnZXQgZm9yIHByb2RcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcInByb2RcIixcbiAgICAgIH0pXG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKVxuXG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZFwiLCB7XG4gICAgICAgIERhc2hib2FyZEJvZHk6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJcXFxcJDUzXCIpLFxuICAgICAgfSlcbiAgICB9KVxuXG4gICAgdGVzdChcImluY2x1ZGVzIGVudmlyb25tZW50LXNwZWNpZmljIG9wdGltaXphdGlvbiBzdHJhdGVnaWVzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGVudmlyb25tZW50cyA9IHtcbiAgICAgICAgZGV2OiBcIkF1dG8tcGF1c2VcIixcbiAgICAgICAgc3RhZ2luZzogXCJTY2hlZHVsZWQgc2NhbGluZ1wiLFxuICAgICAgICBwcm9kOiBcIlByZWRpY3RpdmUgc2NhbGluZ1wiLFxuICAgICAgfVxuXG4gICAgICBPYmplY3QuZW50cmllcyhlbnZpcm9ubWVudHMpLmZvckVhY2goKFtlbnYsIHN0cmF0ZWd5XSkgPT4ge1xuICAgICAgICBjb25zdCBlbnZTdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCBgJHtlbnZ9U3RyYXRlZ3lTdGFja2AsIHtcbiAgICAgICAgICBlbnY6IHsgcmVnaW9uOiBcInVzLWVhc3QtMVwiIH0sXG4gICAgICAgIH0pXG4gICAgICAgIGNvbnN0IGVudkNsdXN0ZXIgPSByZHMuRGF0YWJhc2VDbHVzdGVyLmZyb21EYXRhYmFzZUNsdXN0ZXJBdHRyaWJ1dGVzKFxuICAgICAgICAgIGVudlN0YWNrLFxuICAgICAgICAgIFwiQ2x1c3RlclwiLFxuICAgICAgICAgIHsgY2x1c3RlcklkZW50aWZpZXI6IGAke2Vudn0tY2x1c3RlcmAgfVxuICAgICAgICApXG5cbiAgICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoZW52U3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgICBjbHVzdGVyOiBlbnZDbHVzdGVyLFxuICAgICAgICAgIGVudmlyb25tZW50OiBlbnYgYXMgXCJkZXZcIiB8IFwic3RhZ2luZ1wiIHwgXCJwcm9kXCIsXG4gICAgICAgIH0pXG5cbiAgICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soZW52U3RhY2spXG5cbiAgICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpDbG91ZFdhdGNoOjpEYXNoYm9hcmRcIiwge1xuICAgICAgICAgIERhc2hib2FyZEJvZHk6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXG4gICAgICAgICAgICBzdHJhdGVneS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoXCItXCIsIFwiXCIpXG4gICAgICAgICAgKSxcbiAgICAgICAgfSlcbiAgICAgIH0pXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIk91dHB1dHNcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJleHBvcnRzIGRhc2hib2FyZCBVUkxcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIipEYXNoYm9hcmRVcmwqXCIsIHtcbiAgICAgICAgVmFsdWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXG4gICAgICAgICAgXCJodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC4qYXVyb3JhLWNvc3QtZGV2XCJcbiAgICAgICAgKSxcbiAgICAgIH0pXG4gICAgfSlcblxuICAgIHRlc3QoXCJpbmNsdWRlcyBjb3JyZWN0IHJlZ2lvbiBpbiBVUkxcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIHRlbXBsYXRlLmhhc091dHB1dChcIipEYXNoYm9hcmRVcmwqXCIsIHtcbiAgICAgICAgVmFsdWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoXCJyZWdpb249dXMtZWFzdC0xXCIpLFxuICAgICAgfSlcbiAgICB9KVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiQ29zdCBUcmFja2luZyBXaWRnZXRzXCIsICgpID0+IHtcbiAgICB0ZXN0KFwiaW5jbHVkZXMgc2luZ2xlIHZhbHVlIHdpZGdldHMgZm9yIGNvc3QgbWV0cmljc1wiLCAoKSA9PiB7XG4gICAgICBuZXcgQXVyb3JhQ29zdERhc2hib2FyZChzdGFjaywgXCJEYXNoYm9hcmRcIiwge1xuICAgICAgICBjbHVzdGVyOiBtb2NrQ2x1c3RlcixcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICB9KVxuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjaylcblxuICAgICAgY29uc3QgZGFzaGJvYXJkQm9keSA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZFwiKVxuICAgICAgY29uc3QgZGFzaGJvYXJkID0gT2JqZWN0LnZhbHVlcyhkYXNoYm9hcmRCb2R5KVswXSBhcyBhbnlcbiAgICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGRhc2hib2FyZC5Qcm9wZXJ0aWVzLkRhc2hib2FyZEJvZHkpXG5cbiAgICAgIGNvbnN0IHNpbmdsZVZhbHVlV2lkZ2V0cyA9IGJvZHkud2lkZ2V0cy5maWx0ZXIoXG4gICAgICAgICh3OiBhbnkpID0+IHcudHlwZSA9PT0gXCJtZXRyaWNcIiAmJiB3LnByb3BlcnRpZXM/LnZpZXcgPT09IFwic2luZ2xlVmFsdWVcIlxuICAgICAgKVxuXG4gICAgICBleHBlY3Qoc2luZ2xlVmFsdWVXaWRnZXRzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApXG4gICAgfSlcblxuICAgIHRlc3QoXCJpbmNsdWRlcyBncmFwaCB3aWRnZXRzIGZvciB0cmVuZHNcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIGNvbnN0IGRhc2hib2FyZEJvZHkgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpDbG91ZFdhdGNoOjpEYXNoYm9hcmRcIilcbiAgICAgIGNvbnN0IGRhc2hib2FyZCA9IE9iamVjdC52YWx1ZXMoZGFzaGJvYXJkQm9keSlbMF0gYXMgYW55XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShkYXNoYm9hcmQuUHJvcGVydGllcy5EYXNoYm9hcmRCb2R5KVxuXG4gICAgICBjb25zdCBncmFwaFdpZGdldHMgPSBib2R5LndpZGdldHMuZmlsdGVyKFxuICAgICAgICAodzogYW55KSA9PiB3LnR5cGUgPT09IFwibWV0cmljXCIgJiYgdy5wcm9wZXJ0aWVzPy52aWV3ID09PSBcInRpbWVTZXJpZXNcIlxuICAgICAgKVxuXG4gICAgICBleHBlY3QoZ3JhcGhXaWRnZXRzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApXG4gICAgfSlcblxuICAgIHRlc3QoXCJpbmNsdWRlcyB0ZXh0IHdpZGdldHMgZm9yIGRvY3VtZW50YXRpb25cIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIGNvbnN0IGRhc2hib2FyZEJvZHkgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpDbG91ZFdhdGNoOjpEYXNoYm9hcmRcIilcbiAgICAgIGNvbnN0IGRhc2hib2FyZCA9IE9iamVjdC52YWx1ZXMoZGFzaGJvYXJkQm9keSlbMF0gYXMgYW55XG4gICAgICBjb25zdCBib2R5ID0gSlNPTi5wYXJzZShkYXNoYm9hcmQuUHJvcGVydGllcy5EYXNoYm9hcmRCb2R5KVxuXG4gICAgICBjb25zdCB0ZXh0V2lkZ2V0cyA9IGJvZHkud2lkZ2V0cy5maWx0ZXIoKHc6IGFueSkgPT4gdy50eXBlID09PSBcInRleHRcIilcblxuICAgICAgZXhwZWN0KHRleHRXaWRnZXRzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApXG4gICAgfSlcbiAgfSlcbn0pXG4iXX0=