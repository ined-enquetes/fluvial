<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/ined-enquetes/fluvial">
    <img src="images/FLEUVE-logo.png" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">FLUVIAL</h3>

  <p align="center">
    Metadata Editor form researcher input to DDI
    <!--
    <br />
    <a href="https://github.com/ined-enquetes/fluvial"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/ined-enquetes/fluvial">View Demo</a>
    &middot;
    <a href="https://github.com/ined-enquetes/fluvial/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/ined-enquetes/fluvial/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
    -->
  </p>
</div>

[![Next][Next.js]][Next-url]
[![React][React.js]][React-url]



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
        <li><a href="#start-application">Start application</a></li>
      </ul>
    </li>
    <li>
      <a href="#usage">Usage</a>
      <ul>
        <li><a href="#admin-interface">Administrative Interface</a></li>
      </ul>
    </li>
    <li><a href="#architecture">Architecture</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->
## About The Project

<img src="images/Screenshot.png" alt="Application screenshot" width="60%" height="auto">

FLUVIAL is a application created by [French Institute for Demographic Studies (INED)](https://ined.fr), aiming to help collaborative documenting of the institution surveys', ultimately generate [DDI](https://ddialliance.org/) Codebook files (2.6, 2.5, 2.1) and DDI Lifecycle files (3.3 XML, 4.0 JSON).


<p align="right">(<a href="#readme-top">back to top</a>)</p>


<!-- GETTING STARTED -->
## Getting Started


### Prerequisites

For this application you'll need [NodeJS](https://nodejs.org/fr) and NPM installed on your computer/server.

  ```sh
  npm install npm@latest -g
  ```

### Installation


1. Clone the repo in the place you want to hosts your app
   ```sh
   git clone https://github.com/ined-enquetes/fluvial.git
   ```
2. Add admin JSON file by copying `example.admins.json` to `admins.json` in data folder and change your credentials.
   ```sh
   cp data/example.admins.json data/admins.json
   sed -i -e 's/user@example.com/MYEMAIL/g' data/admins.json
   sed -i -e 's/password/MYNEWSTRONGPASSWORD/g' data/admins.json
   ```
3. Install NPM packages
   ```sh
   npm i
   ```
4. Build the website
   ```sh
   npm run build
   ```

🎉 Well done, you're ready to document your survey !

### Start application

If you want to run the application locally, you can use the following :

```sh
  node .next/standalone/server.js
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

### Admin Interface
You can access to the adinistration of the website by going to the following URL : **https://[your-webiste]/admin**

Each questionnaire instance has a **Historique des modifications** button. It lists the changes made to the answers: date, author, source (questionnaire or JSON import) and the old → new value of each modified field. The history is stored per questionnaire in `data/responses/[token]/history/`.

### Questionnaires and languages
Questionnaire forms live in `data/questionnaires/`. Each JSON file is a complete SurveyJS questionnaire and its file name is used as its identifier: `fr.json` is the French form, `en.json` the English one.

When creating or editing an instance, the administrator selects which questionnaire the instance uses. To add a new language or a form with a different set of DDI fields, copy an existing file, edit it, and drop it in `data/questionnaires/`: it is listed automatically in the admin interface.

Existing installations are backwards compatible: instances created before this feature have no questionnaire selection and keep using `data/survey-template.json`. That legacy file is also listed in the admin interface as the **Questionnaire historique**, so it remains selectable even if the `data/questionnaires/` folder is missing from an old data volume.

The admin interface can generate a DDI export on demand from the stored JSON metadata. DDI Codebook 2.6, 2.5 and 2.1 are XML; DDI Lifecycle 3.3 is XML and DDI Lifecycle 4.0 is JSON. The JSON storage format is left unchanged; the file is produced when the download is requested. The Lifecycle conversion table is parametric and lives in `data/ddi-lifecycle-mapping.json`.

Each instance also has an **Importer un DDI** button. Importing a DDI Codebook 2.6, 2.5 or 2.1 file replaces the instance metadata with the values found in the XML. Some FLUVIAL-specific information cannot be represented in DDI (for example numeric controlled-vocabulary codes or application-only fields), so import is best-effort. The instance logo file is preserved because it is an application asset rather than study metadata. DDI Lifecycle exports (3.3 and 4.0) are export-only for now.

For the full DDI workflow, the field registry and validation steps, see [`docs/DDI.md`](docs/DDI.md) (English) or [`docs/DDI.fr.md`](docs/DDI.fr.md) (français).

<p align="right">(<a href="#readme-top">back to top</a>)</p>

## Architecture
```
metadata-template/
└── src/
    ├── app/
    │   ├── admin/                        # Admin Interface
    │   │   └── page.tsx
    │   ├── api/
    │   │   ├── admin/
    │   │   │   └── instances/            # CRUD instances (admin only)
    │   │   │       └── route.ts
    │   │   └── survey/
    │   │       ├──[token]/               # Survey access by secret token
    │   │       │   ├── comments/
    │   │       │   │   ├──[commentId]/   
    │   │       │   │   │   └── route.ts  # Comment suppression
    │   │       │   │   └── route.ts      # Comment creation and read
    │   │       │   ├── import/
    │   │       │   │   └── ddi/
    │   │       │   │       └── route.ts  # Import DDI Codebook (2.6 / 2.5 / 2.1)
    │   │       │   ├── export/
    │   │       │   │   ├── ddi/
    │   │       │   │   │   └── route.ts  # Export DDI Codebook + Lifecycle (2.x / 3.3 / 4.0)
    │   │       │   │   └── route.ts      # Export JSON
    │   │       │   └── route.ts
    │   │       └── save/                 # Reponses save
    │   │           └── route.ts
    │   ├── survey/
    │   │   └──[token]/                   # User Interface (Questionaire)
    │   │       └── page.tsx
    │   └── page.tsx                      # Home Page
    ├── components/
    │   ├── CommentThread.tsx             # Comments component
    │   ├── Survey.tsx                    # SurveyJS component
    │   └── UserHeader.tsx                # Header display for name management
    ├── data/
    │   ├── questionnaires/               # Selectable SurveyJS questionnaires
    │   │   ├── fr.json                   # French questionnaire
    │   │   └── en.json                   # English questionnaire
    │   ├── responses/                    # Responses list
    │   │   ├──[token]/                   # Survey Token
    │   │   │   ├── comments.json         # Comments of survey
    │   │   │   ├── history/              # Change history (one file per editing session)
    │   │   │   └── responses.json        # Responses of Survey
    │   │   └── archives/                 # Deleted questionnaires (whole folder moved here)
    │   ├── survey-template.json          # Legacy fallback questionnaire
    │   ├── ddi-lifecycle-mapping.json    # Parametric DDI Lifecycle 3.3 / 4.0 conversion table
    │   ├── instances.json                # Instances
    │   └── admins.json                   # Tokens admin
    ├── lib/
    │   ├── commentService.ts             # Service to handle comments
    │   ├── cookiesUtils.ts               # Service to handle user comment
    │   ├── questionnaires.ts             # Questionnaire discovery and loading
    │   ├── ddi.ts                        # DDI Codebook XML generator (2.6 / 2.5 / 2.1)
    │   ├── ddiImport.ts                  # DDI Codebook XML importer (2.6 / 2.5 / 2.1)
    │   ├── ddiMapping.ts                 # Declarative mapping registry (export + import)
    │   ├── ddiXml.ts                     # Shared DDI XML primitive helpers
    │   ├── ddiLifecycleMapping.ts        # Typed loader for the Lifecycle conversion table
    │   ├── ddiLifecycle.ts               # Shared Lifecycle study model and date helpers
    │   ├── ddiLifecycle33.ts             # DDI Lifecycle 3.3 XML generator
    │   ├── ddiLifecycle40.ts             # DDI Lifecycle 4.0 JSON generator
    │   └── saveUtils.ts                  # Service to handle JSON files writing/reading
    └── types/
        └── index.ts
```


<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top contributors:

<a href="https://github.com/ined-enquetes/fluvial/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ined-enquetes/fluvial" alt="contrib.rocks image" />
</a>



<!-- LICENSE -->
## License

 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/"><img src="https://mirrors.creativecommons.org/presskit/buttons/88x31/png/by-nc-sa.png" width="150"/></a>

Distributed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/). See `LICENSE` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

Thibaud Ritzenthaler - thibaud.ritzenthaler@ined.fr

Project Link: [https://github.com/ined-enquetes/fluvial](https://github.com/ined-enquetes/fluvial)

<p align="right">(<a href="#readme-top">back to top</a>)</p>




<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/ined-enquetes/fluvial.svg?style=for-the-badge
[contributors-url]: https://github.com/ined-enquetes/fluvial/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/ined-enquetes/fluvial.svg?style=for-the-badge
[forks-url]: https://github.com/ined-enquetes/fluvial/network/members
[stars-shield]: https://img.shields.io/github/stars/ined-enquetes/fluvial.svg?style=for-the-badge
[stars-url]: https://github.com/ined-enquetes/fluvial/stargazers
[issues-shield]: https://img.shields.io/github/issues/ined-enquetes/fluvial.svg?style=for-the-badge
[issues-url]: https://github.com/ined-enquetes/fluvial/issues
[license-shield]: https://img.shields.io/github/license/ined-enquetes/fluvial.svg?style=for-the-badge
[license-url]: https://github.com/ined-enquetes/fluvial/blob/master/LICENSE.txt
[product-screenshot]: images/screenshot.png
<!-- Shields.io badges. You can a comprehensive list with many more badges at: https://github.com/inttter/md-badges -->
[Next.js]: https://img.shields.io/badge/Next.js-black?logo=next.js&logoColor=white
[Next-url]: https://nextjs.org/
[React.js]: https://img.shields.io/badge/React-%2320232a.svg?logo=react&logoColor=%2361DAFB
[React-url]: https://reactjs.org/
[cc]: https://mirrors.creativecommons.org/presskit/buttons/88x31/png/by-nc-sa.png
[cc-url]: https://creativecommons.org/licenses/by-nc-sa/4.0/
