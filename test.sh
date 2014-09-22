#!/bin/bash
# This is meant to be run inside project folder

DIR=`dirname $0`
PROJECT_ROOT=`pwd`
HASH=`md5sum <<< "$PROJECT_ROOT" | awk '{ print $1 }'`
TMP="/tmp/wp-upgrader/$HASH"
USERAGENT="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_0) AppleWebKit/537.1 (KHTML, like Gecko, L_y_n_x) Chrome/21.0.1180.79 Safari/537.1"
SITEURL=`wp option get siteurl`
WP_CONTENT_DIR=`wp eval 'echo WP_CONTENT_DIR;'`
echo "* Site URL detected as $SITEURL"

# Create our tmp directory
echo "* Creating temporary directory $TMP"
rm -fr $TMP
mkdir -p $TMP/{before,after}

# Backup DB
echo "* Exporting DB"
wp db export $TMP/before.sql

# Add our mu-plugin to collect 'error_log's
sed "s|TEMP_DIR_PLACEHOLDER|$TMP/before|" $DIR/mu-plugins/php_error_log_handle.php > $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# Get homepage links
echo "* Extracting link list from $SITEURL"
LINKS=$( lynx -dump -useragent="$USERAGENT" -hiddenlinks=merge $SITEURL | sed -n '/^References$/,/References/p' | awk 'NR > 2' | sed 's/[0-9]*\.//'  )

echo "* Traversing links, extracting unique site-based"
declare -a URLS=()
for link in $LINKS
do
	link=$( sed s/#.*// <<< $link )
	[[ $link != *$SITEURL* ]] && continue; # ignore if does not have our SITEURL
	URLS+="$link "
done

echo "* All URLS:"
URLS=$( echo $URLS | tr ' ' '\n' | sort -u )

echo "* Final URL list:"
echo ${URLS[*]} | tr ' ' '\n' | sed -e 's/^/>> /'

# cURL URLS!
for url in $URLS; do
	echo "* -- Hitting $url"
	curl -L -A "$USERAGENT" `awk '{ print $1 }' <<< $url` >/dev/null 2>&1
done

echo "* Updating WordPress"
wp core update --version=3.9.2

# Add our mu-plugin to collect 'error_log's
sed "s|TEMP_DIR_PLACEHOLDER|$TMP/after|" $DIR/mu-plugins/php_error_log_handle.php > $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# cURL URLS!
for url in $URLS; do
	echo "* -- Hitting $url"
	curl -L -A "$USERAGENT" `awk '{ print $1 }' <<< $url` >/dev/null 2>&1
done

echo "* Removing the mu-plugin"
rm -f $WP_CONTENT_DIR/mu-plugins/xt_php_error_log_handle.php

# Comparing logs folders
LOG_DIFF=$( diff -rq $TMP/before $TMP/after )

[[ $LOG_DIFF ]] && echo 'Different log entries detected, upgrade needs manual handling.' && echo $LOG_DIFF && exit 1;
echo 'Identical log entries found, upgrade was successful.' && exit 0;
