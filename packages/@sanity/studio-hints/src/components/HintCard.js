import React from 'react'
import PropTypes from 'prop-types'
import LaunchIcon from 'part:@sanity/base/launch-icon'
import styles from './HintCard.css'
import {resolveUrl} from './utils'

function HintCard(props) {
  const {card} = props
  /**
   * Hint cards currently only link to external sources.
   * In future iterations a hint card may have it's own page
   * that opens by clicking the card (onCardClick prop), that
   * then renders the HintPage.js component.
   */
  /*
  <div className={styles.root} onClick={() => onCardClick(card._id)}>
    <h4 className={styles.cardTitle}>
      {card.title} <ArrowRight />
    </h4>
    <p className={styles.cardSummary}>{card.summary}</p>
  </div>
  */
  return (
    <li>
      <a
        href={resolveUrl(card.hint)}
        className={styles.root}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span className={styles.cardTitle}>
          {card.titleOverride || card.hint.title}
          <span className={styles.externalIcon}>
            <LaunchIcon />
          </span>
        </span>
        <p className={styles.cardSummary}>{card.hint.description}</p>
      </a>
    </li>
  )
}

HintCard.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  card: PropTypes.object.isRequired
  // onCardClick: PropTypes.func.isRequired
}

export default HintCard
