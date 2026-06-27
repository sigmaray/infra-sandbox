FROM drupal:10-apache

WORKDIR /opt/drupal

USER root

RUN composer require drush/drush --no-interaction --no-progress

USER www-data
