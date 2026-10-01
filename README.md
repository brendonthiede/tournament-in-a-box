# tournament-in-a-box

FIRST LEGO League regional director's tool for simplifying tournament operations.

## Features

This tool is meant to help a Tournament Director of FIRST Lego League tournaments generate many supporting files & organise their tournament.

- Overall tournament scheduling (start, lunch, finish)
- Game & judging scheduling
- Closing Powerpoint slides
- Printed resources
  - Tournament schedule
  - Judging schedule
  - Game schedule
  - Individual team schedules (their judging & game times)
  - Location signage
    - Individual pit table signage
    - Judge room signage
    - Miscellaneous 'Do not enter signage'
  - Award certificates
  - Practise table sign-up sheet

## Manual

TODO: step-by-step guide

## For developers

### Building a development copy

1. Ensure you have Node 24 (current LTS) installed. The repo has an `.nvmrc`, so `nvm use` / `fnm use` pick it up.
2. Enable Corepack so the pinned Yarn version in `package.json` is used automatically: `corepack enable`
3. Clone the repository `git clone git@github.com:first-australia/tournament-in-a-box.git`
4. Install the dependencies `yarn install`

If you wish to develop a feature:

5. Create an issue in GitHub
6. Checkout the latest master, `git checkout master; git fetch; git pull`
7. Checkout into a new branch for development `git checkout -b ISSUE_NUMBER-dev-branch-title`
8. If master updates during your work run `git rebase master` (to rerun and your development commits after bringing master into your dev branch)
9. Push and create a GitHub PR `git push`

Use `yarn start` to run your development copy and `yarn test` to run the tests (`CI=true yarn test` runs them once instead of in watch mode).

### To deploy to production

We currently have a manual deploy system, we may implement proper GitHub actions sometime in the future.

Don't deploy from a branch other than `master`.

1. After running the steps above, ensure you are on the master branch with updated work `git checkout master; git fetch; git pull`
2. Run the pre-deploy (build) script `yarn predeploy`
3. Deploy to GitHub, on the `gh-pages` branch `yarn deploy`
   - NOTE: You do need your ssh keys setup, and to have write access to the repository for this

#### Using a container

Often containers are very useful for devs, so that they can separate the projects installations (like `yarn` & `node`) from their main operation system (IE: we don't want to install many versions of `node` in our own computer). Containers also can help ensure consistencies in installation across different machines too.

I suggest Podman, though Docker is often interoperable too.

```sh
# In your .zprofile or .bashrc or (.bashalias or .zshalias (which is sourced by .bashrc or.zprofile))

alias ms24='podman run -it \
  --workdir /home/node/ \
  --rm=true \
  --volume=$HOME/.ssh:/root/.ssh:ro \
  --volume=$HOME/.config/git/config:/root/.gitconfig:ro \
  --volume=./:/home/node/ \
  --network=host node:24'
alias ms24d='ms24 yarn start'
alias ms24t='ms24 yarn test'
```

- `it` runs an interactive terminal (for when you don't use the `ms24d` or `ms24t` alias')
- `rm` deletes the container when you exit, to ensure you don't accumulate many containers
- `volume=$HOME/.ssh` is used to allow deploying
  - This shares your `ssh` public & private key, that you presumably have linked to GitHub
  - NOTE: this is not needed unless deploying to production
- `volume=$HOME/.config/git/config ...` is used to allow deploy
  - This shares your `git` email & username
  - NOTE: your git config file may be in your home directory instead: `~/.gitconfig`
  - NOTE: this is not needed unless deploying to production

### Software stack

This project runs on the internet, served by GitHub Pages.

- Node 24
- Yarn 4 (via Corepack)
- Javascript
- React (Create React App / `react-scripts`)
- Bootstrap ui components

There is no backend to this project, as it's simple all-in-your-browser software.

# Contribution

Virtually all of this repository has been made by Fred, head referee of FLL for FIRST Australia
