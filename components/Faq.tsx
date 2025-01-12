'use client';

import { Accordion, Container, Title } from '@mantine/core';
import classes from './Faq.module.css';

export function Faq() {
  return (
    <Container size="sm" className={classes.wrapper}>
      <Title ta="center" className={classes.title}>
        Frequently Asked Questions
      </Title>

      <Accordion variant="separated">
        <Accordion.Item className={classes.item} value="access">
          <Accordion.Control>How do I get access to the AI tools?</Accordion.Control>
          <Accordion.Panel>
            Access to PSD AI Tools is automatically granted to all Peninsula School District staff members using their district email credentials. Simply sign in with your @psd401.net email address to get started.
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="training">
          <Accordion.Control>Is training available for these tools?</Accordion.Control>
          <Accordion.Panel>
            Yes! We offer regular training sessions for all our AI tools. Check the Professional Development calendar for upcoming sessions, or access our on-demand training videos in the Resources section.
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="data-privacy">
          <Accordion.Control>How is student data protected?</Accordion.Control>
          <Accordion.Panel>
            All our AI tools are FERPA compliant and follow strict data privacy guidelines. We never store sensitive student information, and all data processing is done securely within district-approved systems.
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="request-tool">
          <Accordion.Control>Can I request a new AI tool for my classroom?</Accordion.Control>
          <Accordion.Panel>
            Absolutely! We welcome suggestions from our educators. Use the 'Request Feature' form in your dashboard to submit ideas for new AI tools that could benefit your teaching practice.
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item className={classes.item} value="support">
          <Accordion.Control>Where can I get help if I'm having issues?</Accordion.Control>
          <Accordion.Panel>
            For technical support, contact the IT Help Desk through Teams or email support@psd401.net. For questions about using the AI tools in your classroom, reach out to your building's Digital Learning Coach.
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Container>
  );
} 