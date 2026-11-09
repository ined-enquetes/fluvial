# DDI Codebook dans FLUVIAL

[English](DDI.md) · **Français**

Ce document explique comment FLUVIAL produit et consomme du XML DDI Codebook,
comment fonctionne le registre de champs, et comment ajouter un nouveau champ
de métadonnées sans casser la sortie DDI.

## Vue d'ensemble

FLUVIAL stocke les métadonnées d'enquête sous la forme d'un **objet JSON plat**
dans `data/responses/<survey-token>/responses.json`. Chaque clé correspond au
`name` d'une question SurveyJS déclarée dans `data/survey-template.json`.

Le XML DDI est **généré à la demande** à partir de ce JSON. Le format de
stockage JSON ne change pas lors de l'export. L'import fonctionne dans le sens
inverse : un fichier DDI est analysé puis converti vers la même structure JSON
plate, ce qui remplace les métadonnées de l'instance.

Les schémas de la DDI Alliance ne sont **ni téléchargés ni lus à l'exécution**.
Les URL des XSD sont uniquement écrites dans le XML comme indications
`xsi:schemaLocation` et reliées depuis l'interface d'administration. Elles
servent pendant le développement à vérifier que le XML généré est valide.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `lib/ddiXml.ts` | Primitives de nœuds XML et rendu (`leaf`, `branch`, `renderNode`, utilitaires de texte). |
| `lib/ddiMapping.ts` | Registre déclaratif pour les champs simples, plus `mappedNodes()` utilisé par l'export. |
| `lib/ddi.ts` | Générateur DDI Codebook 2.6 / 2.5 / 2.1 et constructeurs écrits à la main pour les sections complexes. |
| `lib/ddiImport.ts` | Analyseur DDI et mappage inverse, y compris l'import via le registre. |
| `app/api/survey/[token]/export/ddi/route.ts` | Point d'accès d'export protégé par l'administrateur. |
| `app/api/survey/[token]/import/ddi/route.ts` | Point d'accès d'import protégé par l'administrateur. |
| `app/admin/page.tsx` | Sélecteur de version, liens de documentation, boutons d'export et d'import. |
| `data/survey-template.json` | Questionnaire SurveyJS ; les `name` des questions deviennent les clés JSON. |
| `data/responses/<token>/responses.json` | Métadonnées stockées pour une instance d'enquête. |

## Flux d'export

```
responses.json
    │  JSON plat : { idno, titl, nation: [...], timePrd: [...], ... }
    ▼
lib/ddi.ts
    ├── buildTitleStatement / buildStudyCitation / buildStudyInfo
    ├── buildMethod / buildAccess / buildRelatedMaterials
    ├── buildFileDescriptions
    └── mappedNodes(...)  ← champs simples issus de lib/ddiMapping.ts
    ▼
XML DDI Codebook 2.6, 2.5 ou 2.1
```

L'interface d'administration appelle :

```http
GET /api/survey/<instanceId>/export/ddi?version=2.6
Authorization: Bearer <adminToken>
```

La route charge l'instance par son `id`, charge ses réponses par son `token`,
appelle `generateDdiCodebook()` et renvoie le XML en pièce jointe. La version
est `2.6` (par défaut), `2.5` ou `2.1`.

## Flux d'import

```
XML DDI
    ▼
lib/ddiImport.ts
    ├── SyntaxValidator (fast-xml-validator, rejette le XML mal formé)
    ├── rejet des DTD, limite de 10 Mo
    ├── détection de la version via @version / l'espace de noms
    ├── conversion des éléments connus vers le JSON plat
    └── applyMappedFields(...)  ← champs simples issus de lib/ddiMapping.ts
    ▼
responses.json (métadonnées remplacées ; logoFile conservé)
```

L'interface d'administration appelle :

```http
POST /api/survey/<instanceId>/import/ddi
Authorization: Bearer <adminToken>
Content-Type: application/xml

<codeBook ...>...</codeBook>
```

L'import est réalisé **au mieux** (« best-effort »). Le DDI ne peut pas
représenter toutes les valeurs propres à FLUVIAL (voir
[Limites de l'aller-retour](#limites-de-laller-retour)).

## Le registre de champs

`lib/ddiMapping.ts` contient `DDI_FIELD_MAPPINGS`, un tableau ordonné de
correspondances de champs simples. Les mêmes entrées sont utilisées par
l'export (`mappedNodes`) et par l'import (`applyMappedFields`) : un champ
simple, scalaire ou liste, n'est donc déclaré qu'une seule fois.

### Anatomie d'une entrée

```ts
interface DdiFieldMapping {
  key: string;              // clé JSON / nom de la question SurveyJS
  element: string;          // nom de l'élément DDI
  parent: string;           // chemin du parent depuis <codeBook>
  kind?: 'text' | 'list';   // par défaut : text
  sourceKeys?: string[];    // clés JSON à essayer, par défaut : [key]
  itemKeys?: string[];      // clés à lire lorsque les éléments de la liste sont des objets
  attrs?: Record<string, string>; // attributs XML statiques
  numeric?: boolean;        // convertit à l'import les valeurs de liste d'apparence numérique
  singleAsScalar?: boolean; // une seule valeur de liste -> scalaire, et non un tableau à un élément
  versions?: DdiVersion[];  // restreint à 2.6, 2.5 et/ou 2.1
}
```

## Ajouter un champ simple

Le cas le plus simple est celui d'un champ dont le parent DDI est déjà relié au
registre. Exemple : ajouter une question en texte libre « Notes sur la
collecte » et l'exporter dans `<method><notes>`.

### 1. Ajouter la question au questionnaire

Dans `data/survey-template.json`, dans la page concernée :

```json
{
  "type": "comment",
  "name": "collNotes",
  "title": "Notes sur la collecte"
}
```

Le `name` devient la clé dans `responses.json`. Il faut le garder stable : les
réponses existantes sont indexées par cette clé.

### 2. Ajouter une entrée au registre

Dans `lib/ddiMapping.ts` :

```ts
{
  key: 'collNotes',
  element: 'notes',
  parent: 'stdyDscr/method',
},
```

C'est suffisant. `buildMethod()` appelle déjà
`mappedNodes('stdyDscr/method', ...)` entre `<dataColl>` et `<anlyInfo>`, et
`importDdiCodebook()` appelle déjà `applyMappedFields()` pour le même parent.

L'export contient désormais :

```xml
<method>
  <dataColl>...</dataColl>
  <notes>Texte saisi dans le formulaire</notes>
  <anlyInfo>...</anlyInfo>
</method>
```

et l'import remet le texte dans `data.collNotes`.

### 3. Facultatif : ajouter une pastille de documentation

Si l'élément ne figure pas déjà dans `DDI_ELEMENT_NAMES` dans
`app/admin/page.tsx`, ajoutez-le afin que l'interface d'administration renvoie
vers sa documentation officielle.

### 4. Valider

Voir [Validation](#validation).

## Parents déjà reliés

Ces chemins de parent disposent déjà d'un appel `mappedNodes()` à l'export et
d'un appel `applyMappedFields()` à l'import. Ajouter une entrée pour l'un
d'eux ne nécessite que l'entrée de registre.

| Chemin du parent | Position dans le XML | Champs actuels du registre |
| --- | --- | --- |
| `stdyDscr/citation/titlStmt` | après `<titl>`, avant `<IDNo>` | `subTitl`, `altTitl`, `parTitl` |
| `stdyDscr/stdyInfo/sumDscr` | après `<timePrd>` et `<collDate>` | `nation`, `geogCover`, `geogUnit`, `analyUnit`, `universe`, `dataKind` |
| `stdyDscr/method` | après `<dataColl>`, avant `<anlyInfo>` | aucun pour l'instant (prêt pour des champs de type notes, p. ex. `collNotes`) |
| `stdyDscr/method/anlyInfo` | à l'intérieur de `<anlyInfo>` | `respRate`, `dataAppr` |

### Règle d'ordre

Les entrées d'un même parent sont émises dans l'ordre du tableau. Cet ordre doit
respecter la séquence du schéma DDI. Par exemple, dans `sumDscrType`, le schéma
attend :

```text
timePrd, collDate, nation, geogCover, geogUnit, geoBndBox, boundPoly,
anlyUnit, universe, dataKind
```

Une nouvelle entrée `nation` doit être placée à côté de l'entrée `nation`
existante, et non à la fin du tableau. La placer après `dataKind` produit un
XML bien formé mais invalide au regard du schéma.

### Ajouter un nouveau parent

Lorsque la section cible ne figure pas dans le tableau ci-dessus, il faut la
relier une première fois :

1. Dans le constructeur correspondant de `lib/ddi.ts`, insérer l'appel au
   registre à la position correcte selon le schéma :

   ```ts
   branch('parentElement', [
     ...customNodes,
     ...mappedNodes('path/to/parent', data, version),
     ...otherNodes,
   ]);
   ```

2. Dans `lib/ddiImport.ts`, après avoir résolu l'enregistrement du parent
   analysé, appeler :

   ```ts
   applyMappedFields(data, parentRecord, version, 'path/to/parent');
   ```

3. Ajouter les entrées au registre.

Ensuite, les champs simples supplémentaires de ce parent ne nécessitent plus
que des entrées de registre.

## Champs complexes

Le registre est volontairement limité aux éléments feuilles dont la valeur est
directement une valeur ou une liste JSON. Les cas suivants restent dans du code
écrit à la main, car ils impliquent des personnes, des attributs issus de
plusieurs clés JSON, des groupes répétés ou de la validation :

| Section | Emplacement |
| --- | --- |
| Titres, numéros d'identification, DOI | `buildTitleStatement` / `buildStudyCitation` |
| Équipe des métadonnées, auteurs, contributeurs, producteurs, financeurs, diffuseurs | `buildDocDescription` / `buildStudyCitation` |
| Mots-clés et thématiques INED/CESSDA | `keywordNodes` / `topicClassNodes` |
| Périodes temporelles et dates de collecte avec attributs | `buildStudyInfo` |
| Collecteurs de données avec abréviation/affiliation | `buildMethod` |
| Champs à vocabulaire contrôlé (`sampProcVC`, `collModeCV`, `resInstruCV`, `timeMeth`) | `buildMethod` |
| Indicateur d'accès aux données (`madProgedo`) | `buildAccess` |
| Matériaux associés, études associées, bibliographies | `buildRelatedMaterials` |
| Descriptions de fichiers et versions de fichiers | `buildFileDescriptions` |

Pour ces cas, suivez les mêmes quatre étapes que pour
[Ajouter un nouveau parent](#ajouter-un-nouveau-parent), mais écrivez à la main
la construction des nœuds et le mappage inverse, en utilisant les utilitaires
de `lib/ddiXml.ts` (`leaf`, `branch`, `recordList`, `firstString`, `valueList`)
et de `lib/ddiImport.ts` (`textOf`, `attr`, `list`, `records`).

## DDI 2.6, 2.5 et 2.1

| | DDI 2.6 | DDI 2.5 | DDI 2.1 |
| --- | --- | --- | --- |
| Espace de noms | `ddi:codebook:2_6` | `ddi:codebook:2_5` | `http://www.icpsr.umich.edu/DDI` |
| `codeBook/@version` | `2.6` | `2.5` | `2.1` |
| Sélecteur | Sélecteur global d'administration | Sélecteur global d'administration | Sélecteur global d'administration |

Un seul générateur gère les trois versions. Le DDI 2.6 est rétrocompatible avec
le 2.5 : un document 2.5 valide devient un document 2.6 valide en changeant
l'espace de noms et l'attribut `codeBook/@version`. Le générateur utilise donc
le chemin de code 2.5 pour la 2.6, sauf si un champ nécessite une forme propre
à une version. Le comportement spécifique à une version se trouve dans :

- `versionStatementNode()` : DDI 2.5 et 2.6 stockent la date de version dans
  `<notes>`, DDI 2.1 la stocke dans l'attribut `date`.
- `buildFileDescriptions()` : DDI 2.1 ne conserve que le premier nom de
  fichier, type de fichier et version de fichier. DDI 2.5 et 2.6 conservent des
  éléments répétables.

Lors de l'ajout d'un champ, vérifiez que l'élément et ses attributs existent
dans chaque version activée. Sinon, utilisez le motif existant
`version === '2.1'` ou ajoutez une restriction `versions` à l'entrée du
registre.

## Ordre du schéma et validité

DDI Codebook utilise `xs:sequence` de XML Schema à plusieurs endroits. L'ordre
des éléments est donc significatif. Un champ peut compiler, apparaître dans le
XML et rendre malgré tout le document invalide parce qu'il a été inséré à la
mauvaise position.

Validez toujours après avoir modifié un mappage. Références utiles :

- Page produit DDI Codebook 2.6 :
  <https://ddialliance.org/ddi-codebook_v2.6>
- Documentation des éléments DDI Codebook 2.6 :
  <https://docs.ddialliance.org/DDI-Codebook/2.6/xmlschema/index.html>
- XSD DDI Codebook 2.6 :
  <https://ddialliance.org/Specification/DDI-Codebook/2.6/XMLSchema/codebook.xsd>
- Spécification DDI Codebook 2.5 :
  <https://ddialliance.org/Specification/DDI-Codebook/2.5/>
- Documentation des éléments DDI Codebook 2.5 :
  <https://docs.ddialliance.org/DDI-Codebook/2.5/xmlschema/index.html>
- XSD DDI Codebook 2.5 :
  <https://ddialliance.org/Specification/DDI-Codebook/2.5/XMLSchema/codebook.xsd>
- Spécification DDI Codebook 2.1 :
  <https://ddialliance.org/ddi-codebook_v2.1>
- XSD DDI Codebook 2.1 :
  <https://ddialliance.org/Specification/DDI-Codebook/2.1/XMLSchema/Version2-1.xsd>

L'interface d'administration expose également ces liens ainsi qu'une liste de
pastilles de documentation par élément.

## Validation

1. Vérifier les types de l'application :

   ```bash
   npx tsc --noEmit
   ```

2. Démarrer l'application et exporter depuis `/admin` chaque version prise en
   charge.

3. Valider le XML par rapport au XSD officiel avec n'importe quel validateur
   XML Schema (`xmllint`, oXygen, Visual Studio, .NET `XmlSchemaSet`, etc.).
   Les schémas 2.6, 2.5 et 2.1 doivent tous indiquer `VALID`.

4. Réimporter le fichier exporté et vérifier que le champ apparaît dans
   `responses.json`.

5. Vérifier qu'un fichier mal formé renvoie toujours HTTP 400 et que les
   requêtes non authentifiées renvoient HTTP 403.

## Référence de l'API

### Export

```http
GET /api/survey/<instanceId>/export/ddi?version=2.6|2.5|2.1
Authorization: Bearer <adminToken>
```

- `200` avec `application/xml` et un nom de fichier de téléchargement.
- `403` lorsque le jeton d'administration est absent ou invalide.
- `404` lorsque l'instance n'existe pas ou n'a pas de réponses.
- `500` en cas d'échec de la génération.

### Import

```http
POST /api/survey/<instanceId>/import/ddi
Authorization: Bearer <adminToken>
Content-Type: application/xml

<codeBook ...>...</codeBook>
```

- `200` avec `{ message, version, fields, warnings }`.
- `400` pour les fichiers vides, mal formés, contenant une DTD ou non
  convertibles.
- `403` lorsque le jeton d'administration est absent ou invalide.
- `404` lorsque l'instance n'existe pas.
- `500` en cas d'erreur serveur inattendue.

Le paramètre de route est l'**identifiant de l'instance** (`id`), et non le
jeton de l'enquête. Les réponses sont chargées et enregistrées avec le `token`
de l'instance.

## Limites de l'aller-retour

L'import n'est pas l'inverse parfait de l'export. Limites connues :

- **Codes numériques des vocabulaires contrôlés** (`timeMeth`, `sampProcVC`,
  `collModeCV`, `resInstruCV`, `analyUnit`) : ils sont exportés sous forme de
  libellés texte. L'import ne peut pas retrouver les codes numériques CESSDA
  d'origine ; les valeurs d'apparence numérique sont placées dans les tableaux
  `*VC` et les autres textes vont dans le champ de détail.
- **Clés historiques** : d'anciennes réponses peuvent utiliser `question10`,
  `analyUnit` ou `Évaluation de la qualité des données`. L'import écrit les clés
  actuelles du modèle (`relMat@url`, `analyUnit`, `dataAppr`).
- **Descriptions de fichiers DDI 2.1** : elles ne conservent que le premier nom
  de fichier, type de fichier et version de fichier.
- **Champs propres à l'application** tels que `logoFile` : ils ne figurent pas
  dans le DDI. L'import conserve le `logoFile` existant, car il s'agit d'une
  ressource téléversée et non d'une métadonnée d'étude.
- **Espaces blancs** : l'import supprime les espaces et sauts de ligne
  finaux et normalise certains espaces blancs. C'est normal.
- **Remplacement** : l'import remplace les métadonnées de l'instance ; il ne
  fusionne pas avec les valeurs existantes (sauf `logoFile`).

## Fichiers associés

- Générateur : `lib/ddi.ts`
- Registre : `lib/ddiMapping.ts`
- Utilitaires XML : `lib/ddiXml.ts`
- Importeur : `lib/ddiImport.ts`
- Questionnaire : `data/survey-template.json`
- Réponses stockées : `data/responses/<token>/responses.json`
- Interface d'administration : `app/admin/page.tsx`