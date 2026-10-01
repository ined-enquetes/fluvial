import type { Question, QuestionPanelDynamicModel } from 'survey-core';

const isDynamicPanel = (question: Question): question is QuestionPanelDynamicModel =>
  question.getType() === 'paneldynamic';

/**
 * Identifier of a field, unique per rendered instance.
 *
 * Fields of a repeated section ("Add new") carry the index of their entry, e.g.
 * `contrib[1].othId@role`, so every row has its own comment thread. Nested
 * sections keep every index, e.g.
 * `fileDscrs[0].file.verStmts[1].file.verStmt.id`.
 *
 * Regular fields keep their schema name (`idno`, `relStdy@URI`, ...), so
 * comments saved before this id scheme are still found.
 */
export function getQuestionId(question: Question): string {
  const parts: string[] = [question.getValueName()];

  let child: Question = question;
  let parent: Question | undefined = child.parentQuestion;

  while (parent) {
    if (isDynamicPanel(parent)) {
      const index = parent.panels.findIndex(panel => panel === child.parent);
      // Index is -1 for a panel that is not part of the section (template, preview)
      parts.unshift(index >= 0 ? `${parent.getValueName()}[${index}]` : parent.getValueName());
    } else {
      parts.unshift(parent.getValueName());
    }

    child = parent;
    parent = child.parentQuestion;
  }

  return parts.join('.');
}
