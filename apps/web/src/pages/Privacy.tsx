import { Link } from 'react-router';
import { LegalPage, LegalSection } from '../components/marketing/LegalPage';

const UPDATED = '19 November 2026';

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <LegalSection heading="1. Who is responsible">
        <p>
          Solution Velocity is self-hosted software. The organisation that runs this deployment controls the
          database and is the data controller for the accounts and workspace content stored in it. There is no
          separate managed database or third-party analytics provider required for the application to work.
        </p>
      </LegalSection>

      <LegalSection heading="2. What is stored">
        <p>When you create an account, the service stores:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>your name and email address;</li>
          <li>a password hash — never the password itself;</li>
          <li>when you accepted these terms and, if verification is enabled, when you confirmed your email address;</li>
          <li>workspace details, the memberships and roles that connect you to them, and the answers you give during onboarding;</li>
          <li>the product records, project work, materials, costs, tasks and progress you create.</li>
        </ul>
        <p>
          Session records contain a hashed session token, the browser you signed in from and an approximate network
          address. They are used to keep you signed in and to sign you out on request.
        </p>
      </LegalSection>

      <LegalSection heading="3. Why it is stored">
        <p>
          Account and session data is processed to operate the service you asked for: signing you in, keeping your
          workspace separate from everyone else&rsquo;s, and sending you the emails you request (verification,
          password reset, invitations).
        </p>
        <p>
          Operational analytics events record actions such as registration, sign-in and product creation. They are
          used to understand whether the service works. If optional analytics consent is declined in the cookie
          banner, optional analytics collection is not enabled.
        </p>
      </LegalSection>

      <LegalSection heading="4. Who can see it">
        <p>
          Members of your workspace can see the data in that workspace, subject to their role. Other workspaces
          cannot read your data: every product, project and record is scoped to the workspace it belongs to.
        </p>
        <p>
          The operator of this deployment and its system administrators can access the database. They are
          responsible for how that access is controlled.
        </p>
      </LegalSection>

      <LegalSection heading="5. Emails">
        <p>
          Account emails are sent through the SMTP provider the operator configures. If no provider is configured,
          the service does not claim to have sent a verification or reset email; it tells you that email delivery
          is unavailable instead.
        </p>
      </LegalSection>

      <LegalSection heading="6. Cookies and local storage">
        <p>
          The service sets one essential cookie when you sign in: an HTTP-only session cookie that keeps you
          signed in. It stores no marketing or tracking identifiers.
        </p>
        <p>
          Your cookie choice is stored locally in your browser. You can change it at any time from the cookie
          preferences control in the footer.
        </p>
      </LegalSection>

      <LegalSection heading="7. Retention and deletion">
        <p>
          Data stays in the operator&rsquo;s database until it is deleted. Workspace owners and administrators can
          remove workspace members; the operator can close accounts on request. Some records, such as stage history
          and progress events, exist to keep the lifecycle history of a product accurate and are removed with the
          workspace or product they belong to.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your choices">
        <p>
          You can update your name and password in Settings, and stop using the service at any time. To ask for a
          copy of your data or its deletion, contact the operator of this deployment or your workspace
          administrator.
        </p>
      </LegalSection>

      <LegalSection heading="9. Contact">
        <p>
          Privacy questions can be sent through the <Link className="font-semibold text-blue-700 underline" to="/request-access">contact form</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
