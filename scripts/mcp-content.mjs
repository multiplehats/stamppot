import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import ts from "typescript";
import { parse as parseYaml } from "yaml";

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const ALLOWED_FRONTMATTER_KEYS = new Set(["category", "related", "tags"]);
const MINIMUM_BODY_LENGTH = 240;
const MINIMUM_TAG_COUNT = 2;
const MAXIMUM_TAG_COUNT = 8;
const RESERVED_INFRASTRUCTURE_PACKAGES = new Set(["mcp-adapter"]);

const fail = (filePath, message) => {
  throw new Error(`${path.relative(process.cwd(), filePath)}: ${message}`);
};

const readStringArray = (value, key, filePath, options = {}) => {
  const { allowEmpty = false } = options;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(filePath, `frontmatter \`${key}\` must be an array of strings`);
  }

  const items = value.map((item) => item.trim());
  if (!allowEmpty && items.length === 0) {
    fail(filePath, `frontmatter \`${key}\` must not be empty`);
  }
  if (new Set(items).size !== items.length) {
    fail(filePath, `frontmatter \`${key}\` must not contain duplicates`);
  }
  return items;
};

const validateMarkdownTokens = (tokens, filePath) => {
  for (const token of tokens) {
    validateMarkdownToken(token, filePath);
  }
};

const validateMarkdownToken = (token, filePath) => {
  if (token.type === "html") {
    fail(
      filePath,
      "raw HTML is not allowed; use Markdown so rendered pages remain safe"
    );
  }
  if (token.type === "link") {
    const isSafeLink =
      token.href.startsWith("/") ||
      token.href.startsWith("#") ||
      token.href.startsWith("https://") ||
      token.href.startsWith("http://");
    if (!isSafeLink) {
      fail(filePath, `link uses an unsupported URL: ${token.href}`);
    }
  }

  const nestedTokens =
    "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];
  validateMarkdownTokens(nestedTokens, filePath);

  const items =
    "items" in token && Array.isArray(token.items) ? token.items : [];
  for (const item of items) {
    validateMarkdownTokens(
      Array.isArray(item.tokens) ? item.tokens : [],
      filePath
    );
  }
};

const validateFrontmatter = (frontmatter, filePath, operationName) => {
  for (const key of Object.keys(frontmatter)) {
    if (!ALLOWED_FRONTMATTER_KEYS.has(key)) {
      fail(filePath, `unsupported frontmatter key \`${key}\``);
    }
  }

  const { category } = frontmatter;
  if (typeof category !== "string" || !SLUG_PATTERN.test(category)) {
    fail(
      filePath,
      "frontmatter `category` must be a lowercase kebab-case slug"
    );
  }

  const tags = readStringArray(frontmatter.tags, "tags", filePath);
  if (tags.length < MINIMUM_TAG_COUNT || tags.length > MAXIMUM_TAG_COUNT) {
    fail(
      filePath,
      `frontmatter \`tags\` must contain ${MINIMUM_TAG_COUNT}-${MAXIMUM_TAG_COUNT} values`
    );
  }
  for (const tag of tags) {
    if (!SLUG_PATTERN.test(tag)) {
      fail(filePath, `tag must be a lowercase kebab-case slug: ${tag}`);
    }
  }

  const related = readStringArray(frontmatter.related, "related", filePath, {
    allowEmpty: true,
  });
  for (const relatedOperation of related) {
    if (!TOOL_NAME_PATTERN.test(relatedOperation)) {
      fail(
        filePath,
        `related tool has an invalid operation name: ${relatedOperation}`
      );
    }
    if (relatedOperation === operationName) {
      fail(filePath, "a tool cannot relate to itself");
    }
  }

  return { category, related, tags };
};

const compileMarkdown = (markdownSource, filePath) => {
  const markdown = markdownSource.trim();
  if (markdown.length < MINIMUM_BODY_LENGTH) {
    fail(
      filePath,
      `Markdown body must contain at least ${MINIMUM_BODY_LENGTH} characters of useful content`
    );
  }

  const headings = [...markdown.matchAll(/^# (.+)$/gm)];
  if (headings.length !== 1 || headings[0]?.index !== 0) {
    fail(
      filePath,
      "Markdown body must start with exactly one level-one heading"
    );
  }
  const title = headings[0]?.[1]?.trim();
  if (title === undefined || title.length < 8) {
    fail(filePath, "level-one heading must provide a descriptive tool title");
  }

  const tokens = marked.lexer(markdown);
  validateMarkdownTokens(tokens, filePath);
  const html = marked.parser(tokens.slice(1));

  return { html, markdown, title };
};

const parseContentFile = async (filePath, mcpId, operationName) => {
  const source = await readFile(filePath, "utf8");
  const match = FRONTMATTER_PATTERN.exec(source);
  if (match === null) {
    fail(filePath, "expected YAML frontmatter enclosed by `---` lines");
  }

  const [, frontmatterSource, markdownSource] = match;
  const frontmatter = parseYaml(frontmatterSource);
  if (
    typeof frontmatter !== "object" ||
    frontmatter === null ||
    Array.isArray(frontmatter)
  ) {
    fail(filePath, "frontmatter must be a YAML object");
  }

  const { category, related, tags } = validateFrontmatter(
    frontmatter,
    filePath,
    operationName
  );
  const { html, markdown, title } = compileMarkdown(markdownSource, filePath);

  return {
    category,
    html,
    markdown,
    mcpId,
    operationName,
    related,
    tags,
    title,
  };
};

const listTypeScriptFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(directory, entry.name));
  const nestedFiles = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => listTypeScriptFiles(path.join(directory, entry.name)))
  );
  return [...files, ...nestedFiles.flat()];
};

const readRegisteredOperationNames = async (sourceDirectory) => {
  const operationNames = new Set();
  const sourceFiles = await listTypeScriptFiles(sourceDirectory);
  const sources = await Promise.all(
    sourceFiles.map((sourcePath) => readFile(sourcePath, "utf8"))
  );

  for (const [sourceIndex, sourcePath] of sourceFiles.entries()) {
    const source = sources[sourceIndex];
    if (source === undefined) {
      fail(sourcePath, "could not read source file");
    }
    const sourceFile = ts.createSourceFile(
      sourcePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const visit = (node) => {
      const isDefinition =
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "defineOperation";
      if (isDefinition) {
        const [definition] = node.arguments;
        if (
          definition === undefined ||
          !ts.isObjectLiteralExpression(definition)
        ) {
          fail(
            sourcePath,
            "defineOperation must receive an inline object literal"
          );
        }
        const nameProperty = definition.properties.find(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ((ts.isIdentifier(property.name) &&
              property.name.text === "name") ||
              (ts.isStringLiteral(property.name) &&
                property.name.text === "name"))
        );
        if (
          nameProperty === undefined ||
          !ts.isPropertyAssignment(nameProperty) ||
          !ts.isStringLiteral(nameProperty.initializer)
        ) {
          fail(
            sourcePath,
            "every defineOperation call must have a literal string `name`"
          );
        }
        operationNames.add(nameProperty.initializer.text);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return operationNames;
};

const loadPackageContent = async (packageDirectory) => {
  const packageName = path.basename(packageDirectory);
  const mcpId = packageName.slice("mcp-".length);
  const registeredOperations = await readRegisteredOperationNames(
    path.join(packageDirectory, "src")
  );
  if (registeredOperations.size === 0) {
    fail(
      packageDirectory,
      "mcp-* package must register at least one operation"
    );
  }

  const contentDirectory = path.join(packageDirectory, "content");
  let contentEntries;
  try {
    contentEntries = await readdir(contentDirectory, { withFileTypes: true });
  } catch {
    fail(packageDirectory, "mcp-* package must contain a `content` directory");
  }

  const markdownFiles = contentEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const documentedOperations = new Set(
    markdownFiles.map((fileName) => fileName.slice(0, -".md".length))
  );

  for (const operationName of registeredOperations) {
    if (!documentedOperations.has(operationName)) {
      fail(
        packageDirectory,
        `operation \`${operationName}\` requires content/${operationName}.md`
      );
    }
  }
  for (const operationName of documentedOperations) {
    if (!registeredOperations.has(operationName)) {
      fail(
        path.join(contentDirectory, `${operationName}.md`),
        `no matching defineOperation name \`${operationName}\` exists in this package`
      );
    }
  }

  return Promise.all(
    markdownFiles.map((fileName) => {
      const operationName = fileName.slice(0, -".md".length);
      return parseContentFile(
        path.join(contentDirectory, fileName),
        mcpId,
        operationName
      );
    })
  );
};

export const loadMcpContent = async (repositoryRoot) => {
  const packagesDirectory = path.join(repositoryRoot, "packages");
  const packageEntries = await readdir(packagesDirectory, {
    withFileTypes: true,
  });
  const mcpPackageDirectories = packageEntries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith("mcp-") &&
        !RESERVED_INFRASTRUCTURE_PACKAGES.has(entry.name)
    )
    .map((entry) => path.join(packagesDirectory, entry.name))
    .sort();

  const content = (
    await Promise.all(mcpPackageDirectories.map(loadPackageContent))
  ).flat();
  const operationNames = new Set(content.map((tool) => tool.operationName));
  for (const tool of content) {
    for (const relatedOperation of tool.related) {
      if (!operationNames.has(relatedOperation)) {
        fail(
          path.join(
            packagesDirectory,
            `mcp-${tool.mcpId}`,
            "content",
            `${tool.operationName}.md`
          ),
          `related tool does not exist: ${relatedOperation}`
        );
      }
    }
  }

  return content;
};
