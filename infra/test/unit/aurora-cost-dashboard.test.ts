import * as cdk from "aws-cdk-lib"
import { Template, Match } from "aws-cdk-lib/assertions"
import * as rds from "aws-cdk-lib/aws-rds"
import { AuroraCostDashboard } from "../../lib/constructs/database/aurora-cost-dashboard"

describe("AuroraCostDashboard", () => {
  let app: cdk.App
  let stack: cdk.Stack
  let mockCluster: rds.IDatabaseCluster

  beforeEach(() => {
    app = new cdk.App()
    stack = new cdk.Stack(app, "TestStack", {
      env: { region: "us-east-1" },
    })

    mockCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(
      stack,
      "MockCluster",
      {
        clusterIdentifier: "test-cluster",
      }
    )
  })

  describe("Dashboard Creation", () => {
    test("creates CloudWatch dashboard", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardName: "aurora-cost-dev",
      })
    })

    test("accepts custom dashboard name", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "prod",
        dashboardName: "my-custom-dashboard",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardName: "my-custom-dashboard",
      })
    })

    test("creates dashboard for each environment", () => {
      const environments: Array<"dev" | "staging" | "prod"> = [
        "dev",
        "staging",
        "prod",
      ]

      environments.forEach((env) => {
        const envStack = new cdk.Stack(app, `${env}Stack`, {
          env: { region: "us-east-1" },
        })
        const envCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(
          envStack,
          "Cluster",
          { clusterIdentifier: `${env}-cluster` }
        )

        new AuroraCostDashboard(envStack, "Dashboard", {
          cluster: envCluster,
          environment: env,
        })

        const template = Template.fromStack(envStack)

        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
          DashboardName: `aurora-cost-${env}`,
        })
      })
    })
  })

  describe("Dashboard Content", () => {
    test("includes ACU capacity metric", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardBody: Match.stringLikeRegexp("ServerlessDatabaseCapacity"),
      })
    })

    test("includes database connections metric", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardBody: Match.stringLikeRegexp("DatabaseConnections"),
      })
    })

    test("includes CPU utilization metric", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardBody: Match.stringLikeRegexp("CPUUtilization"),
      })
    })

    test("includes cost calculation expressions", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard")
      const dashboard = Object.values(dashboardBody)[0] as any
      const body = JSON.parse(dashboard.Properties.DashboardBody)

      // Should have math expressions for cost calculations
      const hasCostCalculation = body.widgets.some((widget: any) =>
        JSON.stringify(widget).includes("0.12")
      ) // $0.12 per ACU-hour

      expect(hasCostCalculation).toBe(true)
    })
  })

  describe("Environment-Specific Content", () => {
    test("shows correct savings target for dev", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardBody: Match.stringLikeRegexp("\\$42"),
      })
    })

    test("shows correct savings target for staging", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "staging",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardBody: Match.stringLikeRegexp("\\$20"),
      })
    })

    test("shows correct savings target for prod", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "prod",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
        DashboardBody: Match.stringLikeRegexp("\\$53"),
      })
    })

    test("includes environment-specific optimization strategies", () => {
      const environments = {
        dev: "Auto-pause",
        staging: "Scheduled scaling",
        prod: "Predictive scaling",
      }

      Object.entries(environments).forEach(([env, strategy]) => {
        const envStack = new cdk.Stack(app, `${env}StrategyStack`, {
          env: { region: "us-east-1" },
        })
        const envCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(
          envStack,
          "Cluster",
          { clusterIdentifier: `${env}-cluster` }
        )

        new AuroraCostDashboard(envStack, "Dashboard", {
          cluster: envCluster,
          environment: env as "dev" | "staging" | "prod",
        })

        const template = Template.fromStack(envStack)

        template.hasResourceProperties("AWS::CloudWatch::Dashboard", {
          DashboardBody: Match.stringLikeRegexp(
            strategy.toLowerCase().replace("-", "")
          ),
        })
      })
    })
  })

  describe("Outputs", () => {
    test("exports dashboard URL", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasOutput("*DashboardUrl*", {
        Value: Match.stringLikeRegexp(
          "https://console.aws.amazon.com/cloudwatch.*aurora-cost-dev"
        ),
      })
    })

    test("includes correct region in URL", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasOutput("*DashboardUrl*", {
        Value: Match.stringLikeRegexp("region=us-east-1"),
      })
    })
  })

  describe("Cost Tracking Widgets", () => {
    test("includes single value widgets for cost metrics", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard")
      const dashboard = Object.values(dashboardBody)[0] as any
      const body = JSON.parse(dashboard.Properties.DashboardBody)

      const singleValueWidgets = body.widgets.filter(
        (w: any) => w.type === "metric" && w.properties?.view === "singleValue"
      )

      expect(singleValueWidgets.length).toBeGreaterThan(0)
    })

    test("includes graph widgets for trends", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard")
      const dashboard = Object.values(dashboardBody)[0] as any
      const body = JSON.parse(dashboard.Properties.DashboardBody)

      const graphWidgets = body.widgets.filter(
        (w: any) => w.type === "metric" && w.properties?.view === "timeSeries"
      )

      expect(graphWidgets.length).toBeGreaterThan(0)
    })

    test("includes text widgets for documentation", () => {
      new AuroraCostDashboard(stack, "Dashboard", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      const dashboardBody = template.findResources("AWS::CloudWatch::Dashboard")
      const dashboard = Object.values(dashboardBody)[0] as any
      const body = JSON.parse(dashboard.Properties.DashboardBody)

      const textWidgets = body.widgets.filter((w: any) => w.type === "text")

      expect(textWidgets.length).toBeGreaterThan(0)
    })
  })
})
