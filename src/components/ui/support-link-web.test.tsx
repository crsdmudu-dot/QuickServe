/**
 * support-link-web.test.tsx — the WEB build of SupportLink must be a real anchor.
 *
 * react-native-web does not map `accessibilityRole="link"` to an `<a>` element (its
 * `roleComponents` table has no `link` entry), so a Pressable with that role renders a focusable
 * `div` with no `href`. On the deployed Auth bridge that would leave a stranded user with a control
 * the browser cannot activate by keyboard, cannot offer "copy email address" for, and cannot show a
 * destination for. This suite pins the anchor.
 *
 * It imports `support-link.web` by its explicit path. Metro's own platform resolution — which picks
 * `.web.tsx` over `.tsx` for the web bundle — is proved separately against the real export, because
 * the Jest run here resolves native modules and could not honestly demonstrate it.
 */
import { render } from '@testing-library/react-native';

import { SupportLink } from '@/components/ui/support-link.web';
import { SUPPORT_EMAIL } from '@/lib/support';

/** The rendered host element for the link, from the react-test-renderer JSON tree. */
function anchorNode() {
  const tree = render(<SupportLink />).toJSON();
  const found: { type: string; props: Record<string, unknown>; children: unknown }[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown };
    if (typeof n.type === 'string') found.push({ type: n.type, props: n.props ?? {}, children: n.children });
    if (n.children) walk(n.children);
  };
  walk(tree);
  return found.find((n) => n.type === 'a');
}

describe('SupportLink (web)', () => {
  it('renders a genuine anchor element, not a role-only substitute', () => {
    const a = anchorNode();
    expect(a).toBeDefined();
    expect(a?.type).toBe('a');
  });

  it('carries the exact static mailto href', () => {
    expect(anchorNode()?.props.href).toBe('mailto:support@hiredcorp.co.ke');
  });

  it('has no click-only substitute standing in for the href', () => {
    const a = anchorNode();
    // A real anchor navigates on its own; no onClick/onPress may be required to reach support.
    expect(a?.props.onClick).toBeUndefined();
    expect(a?.props.onPress).toBeUndefined();
    expect(a?.props.href).toBeTruthy();
  });

  it('interpolates no dynamic value into the href', () => {
    const href = String(anchorNode()?.props.href);
    expect(href).toBe(`mailto:${SUPPORT_EMAIL}`);
    expect(href).not.toMatch(/[?#&]/);
    expect(href).not.toMatch(/subject=|body=|cc=|bcc=|token|auth|recovery|confirm/i);
  });

  it('is keyboard reachable and Enter-activatable by being an anchor with an href', () => {
    const a = anchorNode();
    // An <a href> is focusable and Enter-activated natively: it must NOT be given a negative
    // tabIndex, and it must not rely on an ARIA role to fake link semantics.
    expect(a?.props.href).toBeTruthy();
    expect(a?.props.tabIndex).not.toBe(-1);
    expect(a?.props.tabIndex).not.toBe('-1');
    expect(a?.props.role).toBeUndefined();
  });

  it('exposes an explicit accessible label', () => {
    expect(anchorNode()?.props['aria-label']).toBe(`Email KwikServe support at ${SUPPORT_EMAIL}`);
  });

  it('keeps the address visible and selectable inside the anchor', () => {
    const { getByText } = render(<SupportLink />);
    expect(getByText(SUPPORT_EMAIL).props.selectable).toBe(true);
  });

  it('gives the anchor at least the 44px minimum target height', () => {
    expect(anchorNode()?.props.style).toMatchObject({ minHeight: 44 });
  });
});
