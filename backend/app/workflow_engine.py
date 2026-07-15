"""
Workflow engine for the Wildcat AI Concierge.

Provides pre-built step-by-step workflow cards for common CSU Chico
campus processes.  Each workflow is a WorkflowCard with realistic
department names, forms, and timeline estimates.
"""
from __future__ import annotations

from typing import Dict, Optional

from app.models import WorkflowCard, WorkflowStep


# ── Template definitions ──────────────────────────────────────────────────────

_WORKFLOWS: Dict[str, WorkflowCard] = {

    # ── 1. Facility Rental ────────────────────────────────────────────────────
    "facility_rental": WorkflowCard(
        title="Facility Rental Process",
        estimated_days="10-14 business days",
        required_forms=[
            "Facility Use Agreement (FUA)",
            "Certificate of Insurance (COI)",
            "Event Risk Assessment Form",
            "Alcohol Permit Application (if applicable)",
        ],
        responsible_offices=[
            "University Events & Conference Services",
            "Risk Management & Insurance",
            "Environmental Health & Safety",
            "Associated Students",
        ],
        steps=[
            WorkflowStep(
                step_number=1,
                title="Facility Selection",
                description=(
                    "Browse available venues on the 25Live Pro scheduling system "
                    "(https://25live.collegenet.com/csuchico). Identify your preferred "
                    "location, date, and time.  Contact University Events & Conference "
                    "Services at (530) 898-6811 with any questions about venue capacity "
                    "or availability."
                ),
                status="pending",
                forms=[],
                department="University Events & Conference Services",
            ),
            WorkflowStep(
                step_number=2,
                title="Submit Facility Use Request Form",
                description=(
                    "Complete the online Facility Use Agreement (FUA) through 25Live Pro "
                    "or pick up a paper form at Kendall Hall 220.  Provide event name, "
                    "expected attendance, setup requirements, and AV/catering needs. "
                    "Submit at least 10 business days before the event date."
                ),
                status="pending",
                forms=["Facility Use Agreement (FUA)"],
                department="University Events & Conference Services",
            ),
            WorkflowStep(
                step_number=3,
                title="Certificate of Insurance",
                description=(
                    "External groups and off-campus organizations must provide a "
                    "Certificate of Insurance naming 'California State University, Chico' "
                    "as additional insured for a minimum of $1,000,000 general liability. "
                    "Internal student organizations may be covered under the Associated "
                    "Students blanket policy — confirm with Risk Management."
                ),
                status="pending",
                forms=["Certificate of Insurance (COI)"],
                department="Risk Management & Insurance",
            ),
            WorkflowStep(
                step_number=4,
                title="Risk Management Review",
                description=(
                    "Risk Management reviews events with alcohol, large attendance (500+), "
                    "amplified sound, or outdoor activities.  Complete the Event Risk "
                    "Assessment Form and submit to riskmanagement@csuchico.edu.  "
                    "Allow 3-5 business days for review.  You will be notified by email "
                    "of any required safety measures or additional insurance."
                ),
                status="pending",
                forms=["Event Risk Assessment Form"],
                department="Risk Management & Insurance",
            ),
            WorkflowStep(
                step_number=5,
                title="Approval & Confirmation",
                description=(
                    "Once all forms are reviewed, University Events will send a written "
                    "confirmation with your booking number.  Review the confirmation for "
                    "setup times, load-in/load-out windows, and any attached conditions. "
                    "Reply within 48 hours to confirm acceptance."
                ),
                status="pending",
                forms=[],
                department="University Events & Conference Services",
            ),
            WorkflowStep(
                step_number=6,
                title="Payment",
                description=(
                    "Internal departments and student organizations are invoiced through "
                    "the campus chartfield system.  External clients must pay via check "
                    "or credit card at least 5 business days before the event.  "
                    "Cancellations made fewer than 5 business days in advance forfeit "
                    "50% of the rental fee.  Contact (530) 898-6811 for fee schedules."
                ),
                status="pending",
                forms=["Payment Authorization Form"],
                department="University Events & Conference Services",
            ),
        ],
    ),

    # ── 2. Academic Accommodations (ARC) ─────────────────────────────────────
    "accommodations": WorkflowCard(
        title="Academic Accommodations Process",
        estimated_days="5-10 business days",
        required_forms=[
            "Disability Services Application",
            "Healthcare Provider Documentation Form",
            "Accommodation Plan Request",
            "Faculty Notification Letter",
        ],
        responsible_offices=[
            "Accessibility Resource Center (ARC)",
            "Student Health Center",
            "Office of the Registrar",
        ],
        steps=[
            WorkflowStep(
                step_number=1,
                title="Contact the Accessibility Resource Center",
                description=(
                    "Schedule an intake appointment with the Accessibility Resource Center "
                    "(ARC) located in Student Services Center 170.  Call (530) 898-5959 "
                    "or email arc@csuchico.edu.  You can also submit the online "
                    "Disability Services Application at arc.csuchico.edu to begin the "
                    "process before your appointment."
                ),
                status="pending",
                forms=["Disability Services Application"],
                department="Accessibility Resource Center (ARC)",
            ),
            WorkflowStep(
                step_number=2,
                title="Submit Supporting Documentation",
                description=(
                    "Provide documentation from a licensed healthcare or mental health "
                    "provider using the ARC Healthcare Provider Documentation Form "
                    "(available on the ARC website).  Documentation must describe the "
                    "functional limitations caused by your disability.  ARC accepts "
                    "documentation from physicians, psychologists, audiologists, and "
                    "other qualified professionals."
                ),
                status="pending",
                forms=["Healthcare Provider Documentation Form"],
                department="Accessibility Resource Center (ARC)",
            ),
            WorkflowStep(
                step_number=3,
                title="Develop Your Accommodation Plan",
                description=(
                    "An ARC Disability Services Specialist will meet with you to review "
                    "your documentation and determine appropriate academic accommodations "
                    "(e.g., extended test time, note-taking support, alternative formats). "
                    "You will co-create an individualized Accommodation Plan that outlines "
                    "all approved supports."
                ),
                status="pending",
                forms=["Accommodation Plan Request"],
                department="Accessibility Resource Center (ARC)",
            ),
            WorkflowStep(
                step_number=4,
                title="Faculty Notification",
                description=(
                    "At the start of each semester, log into the ARC portal and send "
                    "Faculty Notification Letters to each of your instructors.  Professors "
                    "are legally required to implement approved accommodations.  It is "
                    "your responsibility to send the letter; ARC recommends doing so "
                    "within the first two weeks of class."
                ),
                status="pending",
                forms=["Faculty Notification Letter"],
                department="Accessibility Resource Center (ARC)",
            ),
            WorkflowStep(
                step_number=5,
                title="Implementation & Ongoing Support",
                description=(
                    "Work directly with your instructors to implement accommodations "
                    "(e.g., schedule testing at the ARC Testing Center for extended time). "
                    "If an instructor does not honor your accommodations, contact ARC "
                    "immediately.  Review and renew your accommodation plan each academic "
                    "year or whenever your needs change."
                ),
                status="pending",
                forms=[],
                department="Accessibility Resource Center (ARC)",
            ),
        ],
    ),

    # ── 3. Parking Permit ─────────────────────────────────────────────────────
    "parking_permit": WorkflowCard(
        title="Parking Permit Process",
        estimated_days="1-2 business days",
        required_forms=[
            "Vehicle Registration (license plate number)",
            "Campus ID / Student/Employee ID",
        ],
        responsible_offices=[
            "University Parking Services",
            "Associated Students Cashier (for daily permits)",
        ],
        steps=[
            WorkflowStep(
                step_number=1,
                title="Select Your Permit Type",
                description=(
                    "Visit the Parking Services website at parking.csuchico.edu to "
                    "review permit options: Student Semester Permit (Lots 1, 2, 3, 6, 7), "
                    "Evening/Weekend Permit, Motorcycle Permit, ADA Accessible Permit, "
                    "or Daily Visitor Permit.  Rates vary by permit type and semester. "
                    "Faculty/Staff permits are managed separately through HR."
                ),
                status="pending",
                forms=[],
                department="University Parking Services",
            ),
            WorkflowStep(
                step_number=2,
                title="Create or Log Into Your Parking Portal Account",
                description=(
                    "Go to parking.csuchico.edu and click 'Buy a Permit'.  Log in with "
                    "your CSU Chico campus ID (same credentials as your student portal). "
                    "First-time users: create an account and add your vehicle's license "
                    "plate number.  You can register up to two vehicles per permit."
                ),
                status="pending",
                forms=["Vehicle Registration (license plate number)"],
                department="University Parking Services",
            ),
            WorkflowStep(
                step_number=3,
                title="Purchase Permit Online",
                description=(
                    "Select your permit type, desired lot, and payment method (credit/debit "
                    "card or e-check).  Semester permits are also available via payroll "
                    "deduction for employees.  After payment, your permit is linked "
                    "digitally to your license plate — no physical hang tag is required "
                    "for virtual permits.  A confirmation email will be sent immediately."
                ),
                status="pending",
                forms=[],
                department="University Parking Services",
            ),
            WorkflowStep(
                step_number=4,
                title="Display Permit (If Physical)",
                description=(
                    "If you purchased a physical hang-tag permit, pick it up at Parking "
                    "Services in the BMU Room 120 (Monday–Friday, 8am–5pm).  Hang the "
                    "tag from your rearview mirror with the barcode visible.  Virtual "
                    "plate-based permits require no physical display — enforcement reads "
                    "your plate automatically.  Always park within your designated lot."
                ),
                status="pending",
                forms=[],
                department="University Parking Services",
            ),
        ],
    ),

    # ── 4. Event Registration ─────────────────────────────────────────────────
    "event_registration": WorkflowCard(
        title="Campus Event Registration Process",
        estimated_days="7-10 business days",
        required_forms=[
            "Event Planning Form (EPF)",
            "Venue Reservation (25Live Pro)",
            "Event Risk Assessment",
            "Promotional Materials Approval (if using campus channels)",
        ],
        responsible_offices=[
            "University Events & Conference Services",
            "Student Life & Leadership",
            "Environmental Health & Safety",
            "Campus Dining (if catering needed)",
            "University Marketing & Communications (for promotion)",
        ],
        steps=[
            WorkflowStep(
                step_number=1,
                title="Complete Event Planning Form",
                description=(
                    "Submit the Event Planning Form (EPF) through the Student Life & "
                    "Leadership portal at studentlife.csuchico.edu or pick up at BMU 220. "
                    "Include event title, sponsoring organization, estimated attendance, "
                    "date/time, budget source, and description of activities.  "
                    "Student organizations must be in good standing (registered with SLL)."
                ),
                status="pending",
                forms=["Event Planning Form (EPF)"],
                department="Student Life & Leadership",
            ),
            WorkflowStep(
                step_number=2,
                title="Venue Selection & Reservation",
                description=(
                    "Log into 25Live Pro (25live.collegenet.com/csuchico) to check venue "
                    "availability and submit a reservation request.  Indoor venues include "
                    "BMU Auditorium, Laxson Auditorium, and various classroom buildings. "
                    "Outdoor spaces include the BMU Quad, Kendall Amphitheater, and "
                    "Sutter Hall Courtyard.  Reservations must be submitted at least "
                    "7 business days in advance."
                ),
                status="pending",
                forms=["Venue Reservation (25Live Pro)"],
                department="University Events & Conference Services",
            ),
            WorkflowStep(
                step_number=3,
                title="Risk Assessment",
                description=(
                    "For events with 100+ attendees, outdoor activities, performers, "
                    "or food service, complete the Event Risk Assessment Form and submit "
                    "to EHS at ehs@csuchico.edu.  EHS may require a site walk-through, "
                    "first aid station, or designated emergency contact on-site.  "
                    "Events with alcohol require additional approval from the Dean of "
                    "Students Office and a licensed bartender."
                ),
                status="pending",
                forms=["Event Risk Assessment"],
                department="Environmental Health & Safety",
            ),
            WorkflowStep(
                step_number=4,
                title="Event Promotion",
                description=(
                    "Promote your event through approved campus channels: submit digital "
                    "flyers to the BMU Information Center for posting, request an "
                    "announcement on the campus events calendar at events.csuchico.edu, "
                    "or contact University Marketing at umarketing@csuchico.edu for "
                    "larger-scale promotions.  Social media promotion through your "
                    "organization's accounts is encouraged."
                ),
                status="pending",
                forms=["Promotional Materials Approval (if using campus channels)"],
                department="University Marketing & Communications",
            ),
            WorkflowStep(
                step_number=5,
                title="Day-of Event Checklist",
                description=(
                    "Arrive 30 minutes early to coordinate setup with venue staff.  "
                    "Ensure all vendors and performers have signed contracts on file with "
                    "SLL.  Have the Event Planning Form confirmation number available for "
                    "Parking Services if guests need event parking validation.  "
                    "After the event, complete the post-event report in the SLL portal "
                    "within 5 business days and return the venue to its original condition."
                ),
                status="pending",
                forms=[],
                department="Student Life & Leadership",
            ),
        ],
    ),
}


# ── Public API ────────────────────────────────────────────────────────────────

def get_workflow(workflow_type: str) -> Optional[WorkflowCard]:
    """
    Return a WorkflowCard for the given workflow_type key.

    Args:
        workflow_type: One of 'facility_rental', 'accommodations',
                       'parking_permit', 'event_registration'.

    Returns:
        A WorkflowCard instance, or None if the type is unknown.
    """
    return _WORKFLOWS.get(workflow_type)


def list_workflow_types() -> list[str]:
    """Return all registered workflow type keys."""
    return list(_WORKFLOWS.keys())
