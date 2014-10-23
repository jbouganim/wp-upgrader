# WordPress Automated Upgrade and Regression Check

## What does this script do ?

- Detects Site meta, URL, wp-content directory, etc..
- Create a temporary directory in /tmp/wp-upgrader/{site-hash}
- Creates a new admin user called wpupgrade, so it can later traverse the admin pages
- Injects a mu-plugin that redirects all PHP errors to a log file, in `before/php.log` file
- Fetches the homepage
- Traversing all local links in homepage, while doing couple of tasks:
  * Taking a screenshot of the loaded page, in `before/shots/*.png`
  * Capturing all JS errors to `before/phantom-front.log`
- Logs in to `/wp-admin`
- Traverses all menu links, while doing the same tasks above
- Updates WordPress to the specified version
- Checks for plugin updates
- Updates outdated plugins
- Reruns the fetching/traversing process of both homepage and admin dashboard, capturing errors in `after` folder instead
- Removes the injected mu-plugin
- Diffs logs from `before` and `after` folder, to tell if the update went smooth or if some problems needs to be examined

## How to use
- Clone the repo somewhere on the server where the site is deployed
- Navigate to the webroot of the site you want to update/test
- Run `bash /path/to/script/repo/start.sh 2>&1 | tee /tmp/wp-upgrader/start.log`

The script will run, as noted above, and you'll have a complete log of the process in `/tmp/wp-upgrader/start.log`, while still be able to see the progress on the screen
You will then be able to check screenshots and logs under `/tmp/wp-upgrader/{site-hash} in both folders {before/after}