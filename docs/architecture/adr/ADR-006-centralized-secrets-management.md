# ADR-006: Centralized Secrets Management with AWS Secrets Manager

## Status

**Proposed** - December 2024

## Context

AI Studio currently manages secrets through a fragmented approach:

1. **Environment Variables**: Lambda functions and ECS tasks use environment variables for sensitive configuration
2. **SSM Parameter Store**: Some database credentials and API keys are stored in SSM
3. **Hardcoded Values**: Historical code contains hardcoded credentials and keys
4. **No Rotation**: Secrets are rotated manually, if at all
5. **No Audit Trail**: Limited visibility into who accessed which secrets and when
6. **No Disaster Recovery**: Secrets are not replicated for disaster recovery scenarios

### Problems with Current Approach

- **Security Risk**: Environment variables are visible in CloudWatch logs and console
- **Compliance Gap**: No automated rotation creates audit findings
- **Manual Processes**: Secret rotation requires manual intervention and causes downtime
- **No Centralization**: Secrets scattered across multiple systems make management difficult
- **Limited Visibility**: No comprehensive audit trail for secret access
- **Single Region**: No disaster recovery capability for secrets

### Requirements

1. Centralized secret storage with encryption at rest
2. Automatic rotation without service interruption
3. Cross-region replication for disaster recovery
4. Comprehensive audit logging
5. Integration with existing Lambda and ECS services
6. Performance optimization to minimize latency
7. Compliance monitoring and reporting

## Decision

We will implement a centralized secrets management architecture using **AWS Secrets Manager** as the primary secrets store, with supporting infrastructure for caching, rotation, and compliance.

### Architecture Components

#### 1. AWS Secrets Manager

**Primary secret storage with:**
- KMS encryption at rest with automatic key rotation
- IAM-based access control with least privilege
- CloudTrail integration for complete audit trail
- Cross-region replication for production secrets
- Native integration with RDS and other AWS services

#### 2. Secret Cache Layer

**Lambda Layer for performance optimization:**
- In-memory caching with configurable TTL (default 1 hour)
- Automatic cache invalidation on rotation events
- Fallback to expired cache on fetch failures
- Version tracking for cache validation
- Singleton pattern for container reuse

**Benefits:**
- Reduced API calls to Secrets Manager (cost optimization)
- Lower latency for secret retrieval (<10ms from cache)
- Resilience to transient Secrets Manager unavailability

#### 3. Automatic Rotation

**Type-specific rotation handlers:**
- **Database Secrets**: 30-day rotation with zero-downtime multi-user strategy
- **API Keys**: 90-day rotation for internal keys
- **OAuth Tokens**: 7-day rotation for short-lived tokens
- **Custom Secrets**: Configurable rotation schedules

**Rotation Process (4-step):**
1. `createSecret`: Generate new secret value
2. `setSecret`: Update target service with new value
3. `testSecret`: Verify new secret works
4. `finishSecret`: Mark rotation complete

#### 4. Compliance Auditor

**Automated compliance monitoring:**
- Daily scans of all secrets
- Alerts for:
  - Secrets without rotation enabled
  - Secrets exceeding maximum age
  - Missing required tags
  - Failed rotation attempts
- CloudWatch dashboard for visualization
- SNS alerts for critical violations

#### 5. Migration Tooling

**Automated migration from existing systems:**
- Scans Lambda functions for secrets in environment variables
- Discovers SSM parameters
- Creates Secrets Manager secrets with proper tagging
- Updates service configurations
- Generates rollback scripts
- Validates migration success

### Implementation Plan

#### Phase 1: Foundation (Week 1)
- Deploy ManagedSecret construct
- Create multi-region KMS keys
- Set up cross-region replication for production
- Deploy ComplianceAuditor

#### Phase 2: Migration Preparation (Week 2)
- Deploy SecretCacheLayer
- Test rotation Lambdas in dev
- Run migration tool in dry-run mode
- Review migration plan

#### Phase 3: Dev Environment Migration (Week 3)
- Execute migration for dev environment
- Update Lambda functions to use cache layer
- Enable rotation schedules
- Validate functionality

#### Phase 4: Staging Migration (Week 4)
- Apply learnings from dev
- Migrate staging secrets
- Performance testing
- Compliance monitoring validation

#### Phase 5: Production Migration (Week 5)
- Final migration checklist review
- Migrate production secrets during maintenance window
- Enable dual-read mode for safety
- Monitor for 24 hours

#### Phase 6: Cleanup & Optimization (Week 6)
- Remove old environment variables and SSM parameters
- Optimize cache TTL based on metrics
- Fine-tune rotation schedules
- Complete documentation

## Consequences

### Positive

1. **Enhanced Security Posture**
   - Encrypted storage with KMS
   - Automatic rotation reduces exposure window
   - No secrets in environment variables or logs
   - Complete audit trail via CloudTrail

2. **Compliance Enablement**
   - Automated compliance scanning
   - Rotation compliance tracking
   - Audit-ready reports
   - Meets SOC 2, ISO 27001, and HIPAA requirements

3. **Operational Excellence**
   - Automatic rotation without downtime
   - Centralized management console
   - Self-healing through compliance auditor
   - Reduced manual intervention

4. **Disaster Recovery**
   - Cross-region replication for production
   - Rapid failover capability
   - No data loss in region failure

5. **Performance Optimization**
   - <10ms cache layer latency
   - 95% reduction in API calls
   - Resilient to Secrets Manager outages

### Negative

1. **Cost Increase**
   - AWS Secrets Manager: ~$20/month (50 secrets × $0.40)
   - API Calls: ~$0.50/month (cached, minimal calls)
   - KMS: Included in secret pricing
   - Cross-Region Replication: ~$5/month
   - **Total: ~$25-30/month**

2. **Migration Complexity**
   - Requires careful planning and testing
   - Service updates needed for all consumers
   - Potential for service disruption if not executed properly
   - Team training required

3. **Initial Development Effort**
   - Estimated 3-4 weeks for full implementation
   - Testing and validation time
   - Documentation updates

### Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Service disruption during migration | High | Medium | Dual-read mode, phased rollout, rollback scripts |
| Rotation failure | High | Low | Manual override capability, alerting, monitoring |
| Performance degradation | Medium | Low | Aggressive caching, load testing, gradual rollout |
| Secret exposure during migration | Critical | Very Low | Encryption in transit and at rest, least privilege IAM |
| Cost overrun | Low | Low | Caching reduces API calls, monitoring budgets |

## Alternatives Considered

### Alternative 1: Continue with SSM Parameter Store

**Pros:**
- Already in use
- Lower cost
- Simpler integration

**Cons:**
- No built-in rotation
- Limited audit capabilities
- No cross-region replication
- Manual rotation process
- Not purpose-built for secrets

**Decision:** Rejected due to lack of rotation and compliance features

### Alternative 2: HashiCorp Vault

**Pros:**
- Advanced features (dynamic secrets, lease management)
- Multi-cloud support
- Rich ecosystem

**Cons:**
- Additional infrastructure to manage
- Operational complexity
- Higher costs (self-hosted or managed)
- Learning curve for team
- Over-engineered for current needs

**Decision:** Rejected due to operational overhead and AWS-native alternatives

### Alternative 3: Hybrid Approach (SSM + Secrets Manager)

**Pros:**
- Gradual migration
- Use best tool for each use case
- Lower initial effort

**Cons:**
- Fragmented secret management
- Complexity in knowing where secrets are
- Inconsistent rotation policies
- Difficult compliance monitoring

**Decision:** Rejected in favor of centralized approach

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Hardcoded Secrets | Unknown | 0 | Code scanning |
| Secrets in Secrets Manager | 0% | 100% | AWS Console |
| Rotation Compliance | 0% | 100% | Config Rules |
| Average Rotation Age | Never | <90 days | CloudWatch |
| Secret Retrieval Latency | N/A | <100ms | X-Ray Traces |
| Audit Coverage | 0% | 100% | CloudTrail |
| DR Recovery Time | N/A | <5 min | DR Testing |

## References

- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [AWS Secrets Manager Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html)
- [AWS KMS Encryption](https://docs.aws.amazon.com/kms/)
- [Rotation Lambda Best Practices](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html)
- Issue #381: Centralized Secrets Management Implementation

## Notes

- Initial implementation focuses on dev/staging environments
- Production rollout requires change management approval
- Quarterly reviews of rotation schedules and compliance
- Annual disaster recovery testing required

## Changelog

- 2024-12-24: Initial draft (Proposed)

---

**Decision Makers:** CIO, Security Team, Platform Engineering Team
**Contributors:** Kris Hagel (CIO), Development Team
**Review Date:** Quarterly
**Next Review:** March 2025
