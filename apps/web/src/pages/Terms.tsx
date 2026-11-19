import { Link } from 'react-router';
import { LegalPage, LegalSection } from '../components/marketing/LegalPage';

const UPDATED = '19 November 2026';

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <LegalSection heading="1. What Solution Velocity is">
        <p>
          Solution Velocity is a product development lifecycle workspace for engineering teams, students and
          educational organisations. It stores the product records, project work, materials, costs and progress
          information that you enter, and presents them as a guided lifecycle.
        </p>
        <p>
          These terms apply to your use of this deployment of Solution Velocity. The operator of the deployment —
          the organisation running the server you are using — is responsible for the service you receive and for
          any agreement it makes with you. Where these terms say &ldquo;we&rdquo;, they refer to that operator.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <p>
          You must provide accurate details when you create an account, and you are responsible for keeping your
          password confidential. You are responsible for activity that happens under your account.
        </p>
        <p>
          Accounts are personal. Do not share a single account between several people; invite teammates to your
          workspace instead so each person has their own account and role.
        </p>
      </LegalSection>

      <LegalSection heading="3. Access during the launch period">
        <p>
          During the current launch period, anyone can create an account and use the standard product development
          functionality without providing payment details. This is a temporary launch arrangement, not a permanent
          promise of free access. Paid plans, when introduced, will be presented separately and will not change the
          rights of existing subscribers retroactively.
        </p>
        <p>
          The operator may change the access policy for new accounts at any time. Existing accounts are not
          downgraded or deleted because of such a change.
        </p>
      </LegalSection>

      <LegalSection heading="4. Your content">
        <p>
          You keep ownership of the information you put into Solution Velocity. You grant the operator the
          permission it needs to store, process and display that information so the service can work for you and the
          members of your workspace.
        </p>
        <p>
          Do not upload content you do not have the right to use, and do not use the service to break the law.
        </p>
      </LegalSection>

      <LegalSection heading="5. Acceptable use">
        <p>
          Do not attempt to access other workspaces, other people&rsquo;s accounts or the operator&rsquo;s
          infrastructure without permission. Do not use automated means to create accounts, scrape data or place
          unreasonable load on the service. Do not upload malware or use the service to harass anyone.
        </p>
        <p>
          Automated registration and sign-in are rate-limited. Deliberate attempts to circumvent those limits may
          result in the account and its workspaces being suspended.
        </p>
      </LegalSection>

      <LegalSection heading="6. Availability and support">
        <p>
          The service is provided as-is. It is under active development, and features may change, be marked
          experimental, or be withdrawn. Where a capability is not yet implemented, the application says so in the
          interface rather than implying it exists.
        </p>
        <p>
          Keep your own copies of anything you cannot afford to lose. The operator&rsquo;s backup arrangements are
          described by that operator, not by these terms.
        </p>
      </LegalSection>

      <LegalSection heading="7. Ending your use">
        <p>
          You may stop using the service at any time. The operator may suspend or close an account that breaches
          these terms, or where legally required to. Where practical, you will be told why.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes to these terms">
        <p>
          If these terms change materially, the &ldquo;last updated&rdquo; date above will change and the operator
          will make reasonable efforts to tell account holders. Continuing to use the service after a change means
          you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="9. Contact">
        <p>
          Questions about these terms can be sent through the <Link className="font-semibold text-blue-700 underline" to="/request-access">contact form</Link>,
          or to your workspace administrator if your account was created by an organisation.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
