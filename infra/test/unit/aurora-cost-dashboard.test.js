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
    describe("Metrics Export", () => {
        test("exports Aurora metrics for consolidated dashboards", () => {
            const dashboard = new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            // Verify metrics interface is exported
            expect(dashboard.metrics).toBeDefined();
            expect(dashboard.metrics.capacity).toBeDefined();
            expect(dashboard.metrics.acuUtilization).toBeDefined();
            expect(dashboard.metrics.connections).toBeDefined();
            expect(dashboard.metrics.cpuUtilization).toBeDefined();
            expect(dashboard.estimatedMonthlyCost).toBeDefined();
        });
        test("does not create CloudWatch dashboard (metrics only)", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Dashboard creation removed - construct only exports metrics
            template.resourceCountIs("AWS::CloudWatch::Dashboard", 0);
        });
        test("exports metrics for all environments", () => {
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
                const dashboard = new aurora_cost_dashboard_1.AuroraCostDashboard(envStack, "Dashboard", {
                    cluster: envCluster,
                    environment: env,
                });
                // Verify metrics are available for each environment
                expect(dashboard.metrics).toBeDefined();
                expect(dashboard.estimatedMonthlyCost).toBeDefined();
            });
        });
    });
    describe("Metric Properties", () => {
        test("capacity metric is defined and available", () => {
            const dashboard = new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const metric = dashboard.metrics.capacity;
            expect(metric).toBeDefined();
            // IMetric interface doesn't expose namespace/metricName, but we can verify the metric exists
            expect(metric.toString()).toContain("ServerlessDatabaseCapacity");
        });
        test("estimated cost metric is defined", () => {
            const dashboard = new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const costMetric = dashboard.estimatedMonthlyCost;
            expect(costMetric).toBeDefined();
            // Cost metric is a MathExpression (implements IMetric)
            // We can't access expression directly via IMetric interface, but we can verify it exists
            expect(costMetric.toString()).toBeDefined();
        });
    });
    describe("No Dashboard Creation", () => {
        test("does not export dashboard URL (dashboard removed)", () => {
            new aurora_cost_dashboard_1.AuroraCostDashboard(stack, "Dashboard", {
                cluster: mockCluster,
                environment: "dev",
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should have no CloudFormation outputs for dashboard URL
            const outputs = template.toJSON().Outputs || {};
            const dashboardUrlOutputs = Object.keys(outputs).filter((key) => key.includes("DashboardUrl"));
            expect(dashboardUrlOutputs.length).toBe(0);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXVyb3JhLWNvc3QtZGFzaGJvYXJkLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhdXJvcmEtY29zdC1kYXNoYm9hcmQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFrQztBQUNsQyx1REFBaUQ7QUFDakQseURBQTBDO0FBQzFDLCtGQUF5RjtBQUV6RixRQUFRLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBQ25DLElBQUksR0FBWSxDQUFBO0lBQ2hCLElBQUksS0FBZ0IsQ0FBQTtJQUNwQixJQUFJLFdBQWlDLENBQUE7SUFFckMsVUFBVSxDQUFDLEdBQUcsRUFBRTtRQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQTtRQUNuQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDdEMsR0FBRyxFQUFFLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUM3QixDQUFDLENBQUE7UUFFRixXQUFXLEdBQUcsR0FBRyxDQUFDLGVBQWUsQ0FBQyw2QkFBNkIsQ0FDN0QsS0FBSyxFQUNMLGFBQWEsRUFDYjtZQUNFLGlCQUFpQixFQUFFLGNBQWM7U0FDbEMsQ0FDRixDQUFBO0lBQ0gsQ0FBQyxDQUFDLENBQUE7SUFFRixRQUFRLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxFQUFFO1FBQzlCLElBQUksQ0FBQyxvREFBb0QsRUFBRSxHQUFHLEVBQUU7WUFDOUQsTUFBTSxTQUFTLEdBQUcsSUFBSSwyQ0FBbUIsQ0FBQyxLQUFLLEVBQUUsV0FBVyxFQUFFO2dCQUM1RCxPQUFPLEVBQUUsV0FBVztnQkFDcEIsV0FBVyxFQUFFLEtBQUs7YUFDbkIsQ0FBQyxDQUFBO1lBRUYsdUNBQXVDO1lBQ3ZDLE1BQU0sQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUE7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IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIlxuaW1wb3J0IHsgVGVtcGxhdGUgfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiXG5pbXBvcnQgKiBhcyByZHMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1yZHNcIlxuaW1wb3J0IHsgQXVyb3JhQ29zdERhc2hib2FyZCB9IGZyb20gXCIuLi8uLi9saWIvY29uc3RydWN0cy9kYXRhYmFzZS9hdXJvcmEtY29zdC1kYXNoYm9hcmRcIlxuXG5kZXNjcmliZShcIkF1cm9yYUNvc3REYXNoYm9hcmRcIiwgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwXG4gIGxldCBzdGFjazogY2RrLlN0YWNrXG4gIGxldCBtb2NrQ2x1c3RlcjogcmRzLklEYXRhYmFzZUNsdXN0ZXJcblxuICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCgpXG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIiwge1xuICAgICAgZW52OiB7IHJlZ2lvbjogXCJ1cy1lYXN0LTFcIiB9LFxuICAgIH0pXG5cbiAgICBtb2NrQ2x1c3RlciA9IHJkcy5EYXRhYmFzZUNsdXN0ZXIuZnJvbURhdGFiYXNlQ2x1c3RlckF0dHJpYnV0ZXMoXG4gICAgICBzdGFjayxcbiAgICAgIFwiTW9ja0NsdXN0ZXJcIixcbiAgICAgIHtcbiAgICAgICAgY2x1c3RlcklkZW50aWZpZXI6IFwidGVzdC1jbHVzdGVyXCIsXG4gICAgICB9XG4gICAgKVxuICB9KVxuXG4gIGRlc2NyaWJlKFwiTWV0cmljcyBFeHBvcnRcIiwgKCkgPT4ge1xuICAgIHRlc3QoXCJleHBvcnRzIEF1cm9yYSBtZXRyaWNzIGZvciBjb25zb2xpZGF0ZWQgZGFzaGJvYXJkc1wiLCAoKSA9PiB7XG4gICAgICBjb25zdCBkYXNoYm9hcmQgPSBuZXcgQXVyb3JhQ29zdERhc2hib2FyZChzdGFjaywgXCJEYXNoYm9hcmRcIiwge1xuICAgICAgICBjbHVzdGVyOiBtb2NrQ2x1c3RlcixcbiAgICAgICAgZW52aXJvbm1lbnQ6IFwiZGV2XCIsXG4gICAgICB9KVxuXG4gICAgICAvLyBWZXJpZnkgbWV0cmljcyBpbnRlcmZhY2UgaXMgZXhwb3J0ZWRcbiAgICAgIGV4cGVjdChkYXNoYm9hcmQubWV0cmljcykudG9CZURlZmluZWQoKVxuICAgICAgZXhwZWN0KGRhc2hib2FyZC5tZXRyaWNzLmNhcGFjaXR5KS50b0JlRGVmaW5lZCgpXG4gICAgICBleHBlY3QoZGFzaGJvYXJkLm1ldHJpY3MuYWN1VXRpbGl6YXRpb24pLnRvQmVEZWZpbmVkKClcbiAgICAgIGV4cGVjdChkYXNoYm9hcmQubWV0cmljcy5jb25uZWN0aW9ucykudG9CZURlZmluZWQoKVxuICAgICAgZXhwZWN0KGRhc2hib2FyZC5tZXRyaWNzLmNwdVV0aWxpemF0aW9uKS50b0JlRGVmaW5lZCgpXG4gICAgICBleHBlY3QoZGFzaGJvYXJkLmVzdGltYXRlZE1vbnRobHlDb3N0KS50b0JlRGVmaW5lZCgpXG4gICAgfSlcblxuICAgIHRlc3QoXCJkb2VzIG5vdCBjcmVhdGUgQ2xvdWRXYXRjaCBkYXNoYm9hcmQgKG1ldHJpY3Mgb25seSlcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIERhc2hib2FyZCBjcmVhdGlvbiByZW1vdmVkIC0gY29uc3RydWN0IG9ubHkgZXhwb3J0cyBtZXRyaWNzXG4gICAgICB0ZW1wbGF0ZS5yZXNvdXJjZUNvdW50SXMoXCJBV1M6OkNsb3VkV2F0Y2g6OkRhc2hib2FyZFwiLCAwKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiZXhwb3J0cyBtZXRyaWNzIGZvciBhbGwgZW52aXJvbm1lbnRzXCIsICgpID0+IHtcbiAgICAgIGNvbnN0IGVudmlyb25tZW50czogQXJyYXk8XCJkZXZcIiB8IFwic3RhZ2luZ1wiIHwgXCJwcm9kXCI+ID0gW1xuICAgICAgICBcImRldlwiLFxuICAgICAgICBcInN0YWdpbmdcIixcbiAgICAgICAgXCJwcm9kXCIsXG4gICAgICBdXG5cbiAgICAgIGVudmlyb25tZW50cy5mb3JFYWNoKChlbnYpID0+IHtcbiAgICAgICAgY29uc3QgZW52U3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgYCR7ZW52fVN0YWNrYCwge1xuICAgICAgICAgIGVudjogeyByZWdpb246IFwidXMtZWFzdC0xXCIgfSxcbiAgICAgICAgfSlcbiAgICAgICAgY29uc3QgZW52Q2x1c3RlciA9IHJkcy5EYXRhYmFzZUNsdXN0ZXIuZnJvbURhdGFiYXNlQ2x1c3RlckF0dHJpYnV0ZXMoXG4gICAgICAgICAgZW52U3RhY2ssXG4gICAgICAgICAgXCJDbHVzdGVyXCIsXG4gICAgICAgICAgeyBjbHVzdGVySWRlbnRpZmllcjogYCR7ZW52fS1jbHVzdGVyYCB9XG4gICAgICAgIClcblxuICAgICAgICBjb25zdCBkYXNoYm9hcmQgPSBuZXcgQXVyb3JhQ29zdERhc2hib2FyZChlbnZTdGFjaywgXCJEYXNoYm9hcmRcIiwge1xuICAgICAgICAgIGNsdXN0ZXI6IGVudkNsdXN0ZXIsXG4gICAgICAgICAgZW52aXJvbm1lbnQ6IGVudixcbiAgICAgICAgfSlcblxuICAgICAgICAvLyBWZXJpZnkgbWV0cmljcyBhcmUgYXZhaWxhYmxlIGZvciBlYWNoIGVudmlyb25tZW50XG4gICAgICAgIGV4cGVjdChkYXNoYm9hcmQubWV0cmljcykudG9CZURlZmluZWQoKVxuICAgICAgICBleHBlY3QoZGFzaGJvYXJkLmVzdGltYXRlZE1vbnRobHlDb3N0KS50b0JlRGVmaW5lZCgpXG4gICAgICB9KVxuICAgIH0pXG4gIH0pXG5cbiAgZGVzY3JpYmUoXCJNZXRyaWMgUHJvcGVydGllc1wiLCAoKSA9PiB7XG4gICAgdGVzdChcImNhcGFjaXR5IG1ldHJpYyBpcyBkZWZpbmVkIGFuZCBhdmFpbGFibGVcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgbWV0cmljID0gZGFzaGJvYXJkLm1ldHJpY3MuY2FwYWNpdHlcbiAgICAgIGV4cGVjdChtZXRyaWMpLnRvQmVEZWZpbmVkKClcbiAgICAgIC8vIElNZXRyaWMgaW50ZXJmYWNlIGRvZXNuJ3QgZXhwb3NlIG5hbWVzcGFjZS9tZXRyaWNOYW1lLCBidXQgd2UgY2FuIHZlcmlmeSB0aGUgbWV0cmljIGV4aXN0c1xuICAgICAgZXhwZWN0KG1ldHJpYy50b1N0cmluZygpKS50b0NvbnRhaW4oXCJTZXJ2ZXJsZXNzRGF0YWJhc2VDYXBhY2l0eVwiKVxuICAgIH0pXG5cbiAgICB0ZXN0KFwiZXN0aW1hdGVkIGNvc3QgbWV0cmljIGlzIGRlZmluZWRcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgZGFzaGJvYXJkID0gbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgY29zdE1ldHJpYyA9IGRhc2hib2FyZC5lc3RpbWF0ZWRNb250aGx5Q29zdFxuICAgICAgZXhwZWN0KGNvc3RNZXRyaWMpLnRvQmVEZWZpbmVkKClcbiAgICAgIC8vIENvc3QgbWV0cmljIGlzIGEgTWF0aEV4cHJlc3Npb24gKGltcGxlbWVudHMgSU1ldHJpYylcbiAgICAgIC8vIFdlIGNhbid0IGFjY2VzcyBleHByZXNzaW9uIGRpcmVjdGx5IHZpYSBJTWV0cmljIGludGVyZmFjZSwgYnV0IHdlIGNhbiB2ZXJpZnkgaXQgZXhpc3RzXG4gICAgICBleHBlY3QoY29zdE1ldHJpYy50b1N0cmluZygpKS50b0JlRGVmaW5lZCgpXG4gICAgfSlcbiAgfSlcblxuICBkZXNjcmliZShcIk5vIERhc2hib2FyZCBDcmVhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVzdChcImRvZXMgbm90IGV4cG9ydCBkYXNoYm9hcmQgVVJMIChkYXNoYm9hcmQgcmVtb3ZlZClcIiwgKCkgPT4ge1xuICAgICAgbmV3IEF1cm9yYUNvc3REYXNoYm9hcmQoc3RhY2ssIFwiRGFzaGJvYXJkXCIsIHtcbiAgICAgICAgY2x1c3RlcjogbW9ja0NsdXN0ZXIsXG4gICAgICAgIGVudmlyb25tZW50OiBcImRldlwiLFxuICAgICAgfSlcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spXG5cbiAgICAgIC8vIFNob3VsZCBoYXZlIG5vIENsb3VkRm9ybWF0aW9uIG91dHB1dHMgZm9yIGRhc2hib2FyZCBVUkxcbiAgICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS50b0pTT04oKS5PdXRwdXRzIHx8IHt9XG4gICAgICBjb25zdCBkYXNoYm9hcmRVcmxPdXRwdXRzID0gT2JqZWN0LmtleXMob3V0cHV0cykuZmlsdGVyKChrZXkpID0+XG4gICAgICAgIGtleS5pbmNsdWRlcyhcIkRhc2hib2FyZFVybFwiKVxuICAgICAgKVxuXG4gICAgICBleHBlY3QoZGFzaGJvYXJkVXJsT3V0cHV0cy5sZW5ndGgpLnRvQmUoMClcbiAgICB9KVxuICB9KVxufSlcbiJdfQ==