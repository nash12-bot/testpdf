import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function getPythonExecutable(): string {
  if (process.env.WORD_ENGINE_PYTHON_PATH && fs.existsSync(process.env.WORD_ENGINE_PYTHON_PATH)) {
    return process.env.WORD_ENGINE_PYTHON_PATH;
  }
  const localVenvWin = path.resolve(process.cwd(), "aspose-env", "Scripts", "python.exe");
  if (fs.existsSync(localVenvWin)) {
    return localVenvWin;
  }
  const localVenvNix = path.resolve(process.cwd(), "aspose-env", "bin", "python");
  if (fs.existsSync(localVenvNix)) {
    return localVenvNix;
  }
  return "python";
}

export type TextEditPayload = {
  originalText?: string;
  text?: string;
  newText?: string;
  value?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontItalic?: boolean;
};

export async function exportDocumentToDocx(options: {
  sourceDocx?: Buffer;
  pdfBytes?: Buffer;
  edits?: TextEditPayload[];
}): Promise<Buffer> {
  const pythonExec = getPythonExecutable();
  const scriptPath = path.resolve(process.cwd(), "scripts", "export-docx.py");
  if (!fs.existsSync(scriptPath)) {
    throw new Error("Word export script not found.");
  }

  const uniqueId = crypto.randomUUID();
  const tempDir = os.tmpdir();
  const tempEdits = path.join(tempDir, `clearpdf_edits_${uniqueId}.json`);
  const tempOut = path.join(tempDir, `clearpdf_out_${uniqueId}.docx`);
  let tempIn: string | null = null;

  try {
    const edits = options.edits ?? [];
    await fs.promises.writeFile(tempEdits, JSON.stringify(edits), "utf-8");

    const args = ["-u", scriptPath, "--edits-json", tempEdits, "--output-docx", tempOut];

    if (options.sourceDocx && options.sourceDocx.byteLength > 0) {
      tempIn = path.join(tempDir, `clearpdf_in_${uniqueId}.docx`);
      await fs.promises.writeFile(tempIn, options.sourceDocx);
      args.push("--input-docx", tempIn);
    } else if (options.pdfBytes && options.pdfBytes.byteLength > 0) {
      tempIn = path.join(tempDir, `clearpdf_in_${uniqueId}.pdf`);
      await fs.promises.writeFile(tempIn, options.pdfBytes);
      args.push("--input-pdf", tempIn);
    } else {
      throw new Error("No source document available for Word export.");
    }

    await execFileAsync(pythonExec, args, {
      timeout: 60_000,
      shell: false,
    });

    if (!fs.existsSync(tempOut)) {
      throw new Error("DOCX export did not produce an output file.");
    }

    return await fs.promises.readFile(tempOut);
  } finally {
    const cleanup = async (filePath: string | null) => {
      if (filePath && fs.existsSync(filePath)) {
        try {
          await fs.promises.unlink(filePath);
        } catch {
          // ignore
        }
      }
    };
    await cleanup(tempIn);
    await cleanup(tempEdits);
    await cleanup(tempOut);
  }
}
