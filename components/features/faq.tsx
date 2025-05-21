'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

const faqItems = [
  {
    question: "How do I get access to the AI tools?",
    answer: "Access to PSD AI Tools is automatically granted to all Peninsula School District staff members using their district email credentials. Simply sign in with your @psd401.net email address to get started."
  },
  {
    question: "Is training available for these tools?",
    answer: "Yes! We offer regular training sessions for all our AI tools. Check the Professional Development calendar for upcoming sessions, or access our on-demand training videos in the Resources section."
  },
  {
    question: "How is student data protected?",
    answer: "All our AI tools are FERPA compliant and follow strict data privacy guidelines. We never store sensitive student information, and all data processing is done securely within district-approved systems."
  },
  {
    question: "Can I request a new AI tool for my classroom?",
    answer: "Absolutely! We welcome suggestions from our educators. Use the 'Request Feature' form in your dashboard to submit ideas for new AI tools that could benefit your teaching practice."
  },
  {
    question: "Where can I get help if I'm having issues?",
    answer: "For technical support, contact the IT Help Desk through Teams or email servicecentral@psd401.net. For questions about using the AI tools in your classroom, reach out to your building's Digital Learning Coach."
  }
];

export function Faq() {
  return (
    <div className="container mx-auto max-w-2xl py-12">
      <h2 className="text-3xl font-bold text-center mb-8">
        Frequently Asked Questions
      </h2>

      <Accordion type="single" collapsible className="w-full">
        {faqItems.map((item, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
} 