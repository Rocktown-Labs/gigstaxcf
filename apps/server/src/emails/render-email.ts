import { render } from "@react-email/render";
import type { ReactElement } from "react";

export interface RenderedEmailTemplate {
  html: string;
  text: string;
}

export async function renderEmailTemplate(
  template: ReactElement
): Promise<RenderedEmailTemplate> {
  const html = await render(template);
  const text = await render(template, { plainText: true });

  return { html, text };
}
