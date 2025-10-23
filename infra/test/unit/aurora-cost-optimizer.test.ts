import * as cdk from "aws-cdk-lib"
import { Template, Match } from "aws-cdk-lib/assertions"
import * as rds from "aws-cdk-lib/aws-rds"
import { AuroraCostOptimizer } from "../../lib/constructs/database/aurora-cost-optimizer"

describe("AuroraCostOptimizer", () => {
  let app: cdk.App
  let stack: cdk.Stack
  let mockCluster: rds.IDatabaseCluster

  beforeEach(() => {
    app = new cdk.App()
    stack = new cdk.Stack(app, "TestStack")

    // Create a mock cluster
    mockCluster = rds.DatabaseCluster.fromDatabaseClusterAttributes(
      stack,
      "MockCluster",
      {
        clusterIdentifier: "test-cluster",
      }
    )
  })

  describe("Development Environment", () => {
    test("enables auto-pause by default", () => {
      new AuroraCostOptimizer(stack, "DevOptimizer", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

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
      })

      // Should create auto-pause schedule
      template.hasResourceProperties("AWS::Events::Rule", {
        ScheduleExpression: "rate(15 minutes)",
        State: "ENABLED",
      })
    })

    test("does not create scheduled scaling by default", () => {
      new AuroraCostOptimizer(stack, "DevOptimizer", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      // Should not create scaling Lambda for dev
      const functions = template.findResources("AWS::Lambda::Function")
      const scalingFunctions = Object.values(functions).filter((fn: any) =>
        fn.Properties?.Handler?.includes("predictive_scaling")
      )

      expect(scalingFunctions).toHaveLength(0)
    })

    test("allows custom idle timeout", () => {
      new AuroraCostOptimizer(stack, "DevOptimizer", {
        cluster: mockCluster,
        environment: "dev",
        idleMinutesBeforePause: 60,
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::Lambda::Function", {
        Environment: {
          Variables: Match.objectLike({
            IDLE_MINUTES_THRESHOLD: "60",
          }),
        },
      })
    })

    test("creates CloudWatch alarm for errors", () => {
      new AuroraCostOptimizer(stack, "DevOptimizer", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::CloudWatch::Alarm", {
        MetricName: "Errors",
        Namespace: "AWS/Lambda",
        Threshold: 3,
        EvaluationPeriods: 1,
      })
    })
  })

  describe("Staging Environment", () => {
    test("enables both auto-pause and scheduled scaling", () => {
      new AuroraCostOptimizer(stack, "StagingOptimizer", {
        cluster: mockCluster,
        environment: "staging",
      })

      const template = Template.fromStack(stack)

      // Should have pause/resume Lambda
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "pause_resume.handler",
      })

      // Should have scaling Lambda
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "predictive_scaling.handler",
      })

      // Should have multiple schedules
      const rules = template.findResources("AWS::Events::Rule")
      expect(Object.keys(rules).length).toBeGreaterThan(2) // At least pause check + scale up + scale down
    })

    test("creates business hours scale-up schedule", () => {
      new AuroraCostOptimizer(stack, "StagingOptimizer", {
        cluster: mockCluster,
        environment: "staging",
        businessHours: {
          scaleUpHour: 8,
          daysOfWeek: "MON-FRI",
        },
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::Events::Rule", {
        ScheduleExpression: Match.stringLikeRegexp("cron.*8.*MON-FRI"),
      })
    })

    test("creates after-hours scale-down schedule", () => {
      new AuroraCostOptimizer(stack, "StagingOptimizer", {
        cluster: mockCluster,
        environment: "staging",
        businessHours: {
          scaleDownHour: 20,
          daysOfWeek: "MON-FRI",
        },
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::Events::Rule", {
        ScheduleExpression: Match.stringLikeRegexp("cron.*20.*MON-FRI"),
      })
    })
  })

  describe("Production Environment", () => {
    test("disables auto-pause by default", () => {
      new AuroraCostOptimizer(stack, "ProdOptimizer", {
        cluster: mockCluster,
        environment: "prod",
      })

      const template = Template.fromStack(stack)

      // Should not have auto-pause schedule (only scaling schedules)
      const rules = template.findResources("AWS::Events::Rule")
      const autoPauseRules = Object.values(rules).filter((rule: any) =>
        rule.Properties?.Description?.toLowerCase().includes("pause")
      )

      expect(autoPauseRules).toHaveLength(0)
    })

    test("enables scheduled scaling by default", () => {
      new AuroraCostOptimizer(stack, "ProdOptimizer", {
        cluster: mockCluster,
        environment: "prod",
      })

      const template = Template.fromStack(stack)

      // Should have scaling Lambda
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "predictive_scaling.handler",
        Environment: {
          Variables: {
            ENVIRONMENT: "prod",
          },
        },
      })

      // Should have multiple scaling schedules
      const rules = template.findResources("AWS::Events::Rule")
      expect(Object.keys(rules).length).toBeGreaterThanOrEqual(2)
    })

    test("creates weekend minimal scaling", () => {
      new AuroraCostOptimizer(stack, "ProdOptimizer", {
        cluster: mockCluster,
        environment: "prod",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::Events::Rule", {
        ScheduleExpression: Match.stringLikeRegexp("cron.*SAT"),
      })
    })

    test("allows explicit auto-pause override", () => {
      new AuroraCostOptimizer(stack, "ProdOptimizer", {
        cluster: mockCluster,
        environment: "prod",
        enableAutoPause: true, // Explicitly enable (not recommended for prod)
      })

      const template = Template.fromStack(stack)

      // Should now have pause/resume Lambda
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "pause_resume.handler",
      })
    })
  })

  describe("IAM Permissions", () => {
    test("grants RDS modification permissions to pause/resume Lambda", () => {
      new AuroraCostOptimizer(stack, "Optimizer", {
        cluster: mockCluster,
        environment: "dev",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "rds:ModifyDBCluster",
                "rds:DescribeDBClusters",
                "cloudwatch:GetMetricStatistics",
              ]),
            }),
          ]),
        },
      })
    })

    test("grants RDS permissions to scaling Lambda", () => {
      new AuroraCostOptimizer(stack, "Optimizer", {
        cluster: mockCluster,
        environment: "staging",
      })

      const template = Template.fromStack(stack)

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                "rds:ModifyDBCluster",
                "rds:DescribeDBClusters",
              ]),
            }),
          ]),
        },
      })
    })
  })

  describe("Custom Configuration", () => {
    test("accepts custom scaling parameters", () => {
      new AuroraCostOptimizer(stack, "Optimizer", {
        cluster: mockCluster,
        environment: "prod",
        scaling: {
          businessHoursMin: 4.0,
          businessHoursMax: 16.0,
          offHoursMin: 2.0,
          offHoursMax: 8.0,
        },
      })

      const template = Template.fromStack(stack)

      // Verify Lambda has environment variables set
      template.hasResourceProperties("AWS::Lambda::Function", {
        Handler: "predictive_scaling.handler",
      })
    })

    test("can disable auto-pause explicitly", () => {
      new AuroraCostOptimizer(stack, "Optimizer", {
        cluster: mockCluster,
        environment: "dev",
        enableAutoPause: false,
      })

      const template = Template.fromStack(stack)

      // Should not have auto-pause schedules
      const rules = template.findResources("AWS::Events::Rule")
      expect(Object.keys(rules)).toHaveLength(0)
    })
  })

  describe("Outputs", () => {
    test("exports configuration summary", () => {
      new AuroraCostOptimizer(stack, "Optimizer", {
        cluster: mockCluster,
        environment: "staging",
      })

      const template = Template.fromStack(stack)

      template.hasOutput("*AutoPauseEnabled*", {
        Value: "true",
      })

      template.hasOutput("*ScheduledScalingEnabled*", {
        Value: "true",
      })
    })
  })
})
