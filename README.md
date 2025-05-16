# AI Code Reviewer

AI Code Reviewer is a GitHub Action that leverages OpenAI's GPT-4 API to provide intelligent feedback and suggestions on
your pull requests. This powerful tool helps improve code quality and saves developers time by automating the code
review process.

## Features

- Reviews pull requests using GPT-4 API of OpenAI or Azure OpenAI.
- Provides intelligent comments and suggestions for improving your code.
- Filters out files that match specified exclude patterns.
- Easy to set up and integrate into your GitHub workflow.

## Setup

1. To use this GitHub Action, you need an OpenAI(Azure OpenAI) API key.

2. Add the OpenAI API key as a GitHub Secret in your repository with the name `OPENAI_API_KEY`. You can find more
   information about GitHub Secrets [here](https://docs.github.com/en/actions/reference/encrypted-secrets).

3. Create a `.github/workflows/main.yml` file in your repository and add the following content:

```yaml
name: AI Code Reviewer

on:
  pull_request:
    types:
      - opened
      - synchronize
      - reopened
      - edited

permissions: write-all
jobs:
  review:
    # You can use the below condition to run the action only when the pull request title starts with "[AI REVIEW]"
    # if: github.event.pull_request && startsWith(github.event.pull_request.title, '[AI REVIEW]')
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repo
        uses: actions/checkout@v3

      - name: AI Code Reviewer
        uses: <your-username>/ai-code-reviewer@develop
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }} # The GITHUB_TOKEN is there by default so you just need to keep it like it is and not necessarily need to add it as secret as it will throw an error. [More Details](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#about-the-github_token-secret)
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          USE_AZURE: false # Whether to use Azure OpenAI or not. Set to true if you are using Azure OpenAI.
          AZURE_ENDPOINT: "" # Optional: Azure OpenAI endpoint. Required if USE_AZURE is true.
          AZURE_API_VERSION: "" # Optional: Azure OpenAI API version. Required if USE_AZURE is true.
          OPENAI_API_MODEL: "gpt-4" # Optional: defaults to "gpt-4"
          EXCLUDE_FILES: "**/*.json, **/*.md" # Optional: exclude patterns separated by commas
          MAX_ALLOWED_LINES: 200 # The maximum number of lines of code to be sent to the AI. Optional: defaults to 200
          MAX_RETURNED_COMMENTS: 10 # The maximum number of comments to be returned by the AI. Optional: defaults to 10

```

4. Replace `your-username` with your GitHub username or organization name where the AI Code Reviewer repository is
   located.

5. If you are using Azure OpenAI, set the `USE_AZURE` input to `true` and provide the `AZURE_ENDPOINT` and
   `AZURE_API_VERSION` inputs. Otherwise, leave them empty.   

6. Customize the `EXCLUDE_FILES` input if you want to ignore certain file patterns from being reviewed.

7. Customize the `MAX_ALLOWED_LINES` input if you want to make more or fewer lines of code available to the AI. It depends on the model you are using.

8. Customize the `MAX_RETURNED_COMMENTS` input if you want to get more or fewer comments from the AI. It depends on the model you are using.

9. Commit the changes to your repository, and AI Code Reviewer will start working on your future pull requests.

## How It Works

The AI Code Reviewer GitHub Action retrieves the pull request diff, filters out excluded files, and sends code chunks to
the OpenAI API. It then generates review comments based on the AI's response and adds them to the pull request.

## License

This project includes code from [ai-codereviewer] (https://github.com/aidar-freeed/ai-codereviewer),
originally licensed under the MIT License.