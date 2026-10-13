// @vitest-environment jsdom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FileUploader } from "../../../apps/web/src/features/files/file-uploader.js";

describe("S05-T02 accessible upload controls", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers a labeled multi-file picker and keyboard-operable drop target", () => {
    render(
      createElement(FileUploader, {
        projectId: "11111111-1111-4111-8111-111111111111",
        apiUrl: "http://api.test/api/v1",
      }),
    );
    const picker = screen.getByLabelText("Upload project files") as HTMLInputElement;
    expect(picker.multiple).toBe(true);
    const target = screen.getByRole("button", { name: "Drop files here or choose files" });
    expect(target.getAttribute("tabindex")).toBe("0");
    const click = vi.spyOn(picker, "click");
    fireEvent.keyDown(target, { key: "Enter" });
    expect(click).toHaveBeenCalledOnce();
  });
});
